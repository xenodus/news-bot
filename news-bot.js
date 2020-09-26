/******************************
  Prod / Dev
*******************************/

const config = require('./config').production;

/******************************
  Variables & Libs
*******************************/

const pool = config.getPool();
const moment = require("moment");
const Discord = require("discord.js");
const client = new Discord.Client();
const helper = require("./helper.js");

const axios = require('axios');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const Parser = require('rss-parser');
const parser = new Parser({
  customFields: {
    feed: [],
    item: ['media:group'],
  }
});

/******************************
  Event Listeners
*******************************/

client.on("error", (e) => console.error(e));
client.on("warn", (e) => console.warn(e));
// client.on("debug", (e) => console.info(e));

client.on("guildCreate", async function(guild) {
  helper.printStatus("Joined a new guild: " + guild.name);
});

client.on("ready", async function() {

  let checkIntervals = 300 * 1000;

  helper.printStatus("I am ready!");

  client.user.setPresence({ activity: { name: '!news help', type: "PLAYING"}, status: 'online'});

  let statuses = [
    '!news help',
    '!news donate'
  ];

  // Random status message every 10s
  client.setInterval(function(){
    client.user.setPresence({ activity: { name: statuses[Math.floor(Math.random() * statuses.length)], type: "PLAYING"}, status: 'online'});
  }, 10000);

  // Check rss feed for each server occasionally (5mins)
  client.setInterval(checkNews, checkIntervals, client);
});

/******************************
  Message Listener
*******************************/

client.on("message", async function(message) {
  if ( message.author.bot )
    return; // Ignore bot message

  message.content = message.content.replace(/“/g, '"').replace(/”/g, '"');

  const args = message.content.slice(config.prefix.length).trim().split(/ +/g);
  const prefix = message.content.charAt(0);
  const command = args.shift().toLowerCase();

  let isAdmin = helper.isAdmin(message.member);

  if ( command === "news" ) {

    switch ( args[0] ) {
      case 'add':
        if( args[1] ) {

          try {

            let url = args[1];

            // YouTube Channels / Videos
            let isYouTube = args[1].toLowerCase().match(/youtube\.com/g) ? true : false;
            let isYouTubeXML = args[1].toLowerCase().match(/youtube\.com\/feeds/g) ? true : false;

            if( isYouTube && !isYouTubeXML ) {
              await axios.get(args[1]).then(async function(response){

                const dom = new JSDOM(response.data);
                let channel_id = dom.window.document.querySelector('meta[itemprop="channelId"]').content;

                if( channel_id ) {
                  url = "https://www.youtube.com/feeds/videos.xml?channel_id=" + channel_id;
                }
              })
              .catch(function(err){
                console.log(err);
              });
            }

            // Reddit Threads / User Profiles
            let isReddit = args[1].toLowerCase().match(/reddit\.com/g) ? true : false;
            let isRedditRSS = args[1].toLowerCase().match(/reddit\.com(.*)\.rss$/g) ? true : false;

            if( isReddit && !isRedditRSS ) {
              if( url[url.length -1] == "/" )
                url = url.slice(0, -1);

              url = url + "/.rss";
            }

            let feed = await parser.parseURL( url );

            await pool.query("DELETE FROM news_feed WHERE channel_id = ?", [message.channel.id]);
            await pool.query("INSERT INTO news_feed SET ?", {
              url: url,
              server_id: message.guild.id,
              channel_id: message.channel.id,
              date_added: moment().format('YYYY-M-D HH:mm:ss')
            })
            .then(function(results){
              if( results.affectedRows > 0 ) {
                helper.sendInfoMsg("Success", "The rss feed, `" +url+ "` has been added for this channel \n\nDo you want me to fetch and display the latest items?\n\nReply with `1` or `yes` to proceed", "success", message);

                // Ensure text entered is one of the options in array
                let options = ["1", "yes"];
                let fetchItemsfilter = function response(m){
                  return options.includes( m.content );
                };

                // Await Reply
                message.channel.awaitMessages(fetchItemsfilter, { max: 1, time: 20000 }).then(async function(collected){

                let feed = await parser.parseURL( url );
                await post2channel(feed, message.channel, true);

                }).catch(function(e){
                  console.log(e);
                });

              }
            });
          }
          catch(e) {
            helper.sendInfoMsg("Error", "Unreadable RSS feed: `" + args[1]+"`", "error", message);
          }
        }
        else
          helper.sendInfoMsg("Info", "Add a rss feed with `!news add feed_url`", "info", message);

        break;

      case 'rm':
      case 'remove':
        await pool.query("DELETE FROM news_feed WHERE channel_id = ?", [message.channel.id]).then(function(results){
          if( results.affectedRows > 0 ) {
            helper.sendInfoMsg("Success", "The rss feed for this channel has been removed", "success", message);
            pool.query("DELETE FROM news_feed_posted WHERE channel_id = ? ", [message.channel.id]);
          }
          else
            helper.sendInfoMsg("Error", "No rss feed has been setup for this channel", "error", message);
        });

        break;

      case 'ls':
      case 'list':
        pool.query("SELECT * FROM news_feed WHERE channel_id = ?", [message.channel.id])
        .then(function(results){
          if( results.length > 0 ) {
            helper.sendInfoMsg("Info", "The rss feed setup for this channel is `" +results[0].url+"`", "info", message);
          }
          else
            helper.sendInfoMsg("Info", "No rss feed has been setup for this channel", "info", message);
        });
        break;

      case 'fetch':
      case 'check':
        pool.query("SELECT * FROM news_feed WHERE channel_id = ?", [message.channel.id])
        .then(async function(results){
          if( results.length > 0 ) {
            let feed = await parser.parseURL( results[0].url );
            await post2channel(feed, message.channel, true);
          }
          else {
            helper.sendInfoMsg("Info", "No rss feed has been setup for this channel", "info", message);
          }
        });
        break;

      case 'help':
        helpTxt = "```md\n# RSS News Feed Commands```" +
          '\nAdd: !news add http://www.myrsss.com/my.rss' +
          '\nShow configured rss feed for channel: !news list' +
          '\nRemove configured rss feed for channel: !news remove' +
          '\nManual fetch of rss feed for new post: !news check';

        message.author.send(helpTxt);
        break;

      case 'donate':
        let donationTitle = "```md\n# Donation Link```" + "```md\n# If you've found the bot useful and would like to donate, you can do so via the link below. Donations will be used to cover server hosting fees. Thanks!```";

        message.author.send(donationTitle);

        let embed1 = new Discord.MessageEmbed()
          .setTitle("1. Buy a Coffee via Ko-fi :link:")
          .setColor("#29abe0")
          .setURL('https://ko-fi.com/xenodus')
          .setThumbnail('https://uploads-ssl.webflow.com/5c14e387dab576fe667689cf/5ca5bf1dff3c03fbf7cc9b3c_Kofi_logo_RGB_rounded-p-500.png');

        message.author.send( embed1 );
        break;
    }

    message.delete();
  }
});

async function post2channel(feed, channel, reverse=false) {

  if( feed.items.length > 0 ) {

    feed.items = feed.items.slice(0, 12);

    if( reverse ) {
      feed.items = feed.items.reverse();
    }

    for( var j = 0; j < feed.items.length; j++) {

      let guid = '';

      if( 'guid' in feed.items[j] )
        guid = 'guid';
      else if( 'link' in feed.items[j] )
        guid = 'link';

      if( guid && feed.items[j][guid] ) {

        // check if already posted
        await pool.query("SELECT * FROM news_feed_posted WHERE channel_id = ? AND guid = ?", [channel.id, feed.items[j][guid]])
        .then(function(results){
          if( results.length == 0 ) {

            let embed = new Discord.MessageEmbed().setColor("#FF0000");
            let item = feed.items[j];

            if( 'title' in item ) {
              if( item.title.length >= 252 )
                item.title = item.title.substr(0, 252) + "...";

              embed.setTitle( item.title );
            }

            let images = getAttrFromString(item.content, 'img', 'src');

            if( images.length > 0 ) {
              embed.setThumbnail( images[0] );
            }

            if( 'contentSnippet' in item ) {

              item.contentSnippet = item.contentSnippet.replace(/\[link\]/g, "").replace(/\[comments\]/g, "");

              if( item.contentSnippet.length > 256 )
                item.contentSnippet = item.contentSnippet.substr(0, 256) + "...";

              embed.setDescription( item.contentSnippet );
            }

            if( 'link' in item ) {
              if( item.link.substr(0, 4) == 'http' )
                embed.setURL( item.link );
              else
                embed.setDescription( item.link );
            }

            if( 'pubDate' in item )
              embed.setFooter( "🗞️" + moment(item.pubDate).format('D MMM YYYY h:mm A') );

            // YouTube Overwrites
            if( feed.items[j]["media:group"] ) {

              // Title
              if( feed.items[j]["media:group"]["media:title"] && feed.items[j]["media:group"]["media:title"].length > 0 ) {
                let youtubeTitle =  feed.items[j]["media:group"]["media:title"][0];

                if( youtubeTitle.length >= 252 )
                  youtubeTitle = youtubeTitle.substr(0, 252) + "...";

                embed.setTitle( youtubeTitle );
              }

              // Img
              if( feed.items[j]["media:group"]["media:thumbnail"] && feed.items[j]["media:group"]["media:title"].length > 0 ) {
                if( feed.items[j]["media:group"]["media:thumbnail"][0]["$"]["url"] ) {
                  embed.setThumbnail( feed.items[j]["media:group"]["media:thumbnail"][0]["$"]["url"] );
                }
              }

              // Description
              if( feed.items[j]["media:group"]["media:description"] && feed.items[j]["media:group"]["media:description"].length > 0 ) {
                let youtubeDescription = feed.items[j]["media:group"]["media:description"][0];

                if( youtubeDescription.length > 256 )
                  youtubeDescription = youtubeDescription.substr(0, 256) + "...";

                embed.setDescription( youtubeDescription );
              }
            }

            channel.send( embed );
            console.log( "Posted " + embed.title + " to channel: " + channel.name );

            pool.query("INSERT INTO news_feed_posted SET ?", {
              channel_id: channel.id,
              guid: item[guid],
              date_added: moment().format('YYYY-M-D HH:mm:ss')
            });
          }
        })
      }
    }
  }
}

function getAttrFromString(str, node, attr) {
  var regex = new RegExp('<' + node + ' .*?' + attr + '="(.*?)"', "gi"), result, res = [];

  while ((result = regex.exec(str))) {
    res.push(result[1]);
  }
  return res;
}

async function checkNews(client) {
  if( client.guilds.cache.size > 0 ) {
    for( var guild of client.guilds.cache.values() ) {
      if( guild.available ) {

        helper.printStatus("");
        helper.printStatus("================================================");
        helper.printStatus("Checking news_feed for server " + guild.name);
        helper.printStatus("================================================");

        await pool.query("SELECT * FROM news_feed WHERE server_id = ?", [guild.id]).then(async function(news_feed_results){

          if( news_feed_results.length > 0 ) {

            helper.printStatus(news_feed_results.length + " feeds found for server " + guild.name);

            for(var i=0; i<news_feed_results.length; i++) {

              let channel = await client.channels.cache.get(news_feed_results[i].channel_id);
              let rss_url = news_feed_results[i].url;

              if(channel) {
                helper.printStatus("Checking feed " + rss_url + " for channel/server, " + channel.name + "/" + guild.name);

                try {
                  let feed = await parser.parseURL( rss_url );
                  await post2channel(feed, channel);
                }
                catch(e) {
                  console.log(e);
                }
              }
              else {
                helper.printStatus("Deleted channel_id " +news_feed_results[i].channel_id+ " for server " + guild.name);
                pool.query("DELETE FROM news_feed WHERE channel_id = ?", [news_feed_results[i].channel_id]);
                pool.query("DELETE FROM news_feed_posted WHERE channel_id = ?", [news_feed_results[i].channel_id]);
              }
            }
          }
        });

        helper.printStatus("================================================");
        helper.printStatus("End checking news_feed for server " + guild.name);
        helper.printStatus("================================================");
      }
    }
  }
}

client.login(config.newsBotToken);