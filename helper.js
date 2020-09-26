/******************************
  Variables & Libs
*******************************/

const moment = require("moment");
const config = require('./config').production;
const pool = config.getPool();
const Discord = require("discord.js");

/******************************
  Helper Functions
*******************************/

module.exports = {

  sendInfoMsg: function(embedTitle="", embedMsg="", type="info", message) {
      // Embed
      let embed = new Discord.MessageEmbed()
        .setTitle(embedTitle)
        .setDescription(embedMsg);

      if(type=="success") {
        embed.setColor(config.successEmbedColor);
        embed.setThumbnail(config.appSuccessImg);
      }
      else if(type=="error") {
        embed.setColor(config.errorEmbedColor);
        embed.setThumbnail(config.appSuccessImg);
      }
      else {
        embed.setColor(config.infoEmbedColor);
        embed.setThumbnail(config.appSuccessImg);
      }

      // Send Message
      message.channel.send( embed ).catch(function(err){
        console.log(err);
      });
  },

  isAdmin: function(member) {
    if (  member.hasPermission('ADMINISTRATOR') ||
          member.hasPermission('MANAGE_CHANNELS') ||
          // member.roles.find(roles => roles.name === "Admin") ||
          Object.keys(config.adminIDs).includes(member.id) )
      return true;
    else
      return false;
  },

  // Print to console with timestamp prefix
  printStatus: function(text) {
    console.log( "[" + moment().format() + "] " + text );
  },
}