// api/services/PlayerService.js

var fs = require('fs');
var extend = require('extend');
var merge = require('deepmerge');
var twitterAPI = require('node-twitter-api');

var parseTree = require('../../assets/js/wikimess/parsetree.js')

// Uncomment to show line numbers on console.log messages
// https://remysharp.com/2014/05/23/where-is-that-console-log
/*
  ['log', 'warn'].forEach(function(method) {
  var old = console[method];
  console[method] = function() {
  var stack = (new Error()).stack.split(/\n/);
  // Chrome includes a single "Error" line, FF doesn't.
  if (stack[0].indexOf('Error') === 0) {
  stack = stack.slice(1);
  }
  var args = [].slice.apply(arguments).concat([stack[1].trim()]);
  return old.apply(console, args);
  };
  });
*/

module.exports = {
  
  capitalize: function (text) {
    return text.charAt(0).toUpperCase() + text.substr(1)
  },

  makeStatus: function (info) {
    var player = info.player || {}, follower = info.follower, messages = info.messages, before = info.before, limit = info.limit || 10
    
    var status = {}
    if (!before)
      extend (status,
              { id: player.id,
                name: player.name,
                displayName: player.displayName,
		twitterScreenName: player.twitterScreenName,
		twitterAuthorized: player.twitterAccessTokenSecret ? true : false,
                gender: player.gender,
                publicBio: player.publicBio,
                nSenderRatings: player.nSenderRatings,
                sumSenderRatings: player.sumSenderRatings,
                nAuthorRatings: player.nAuthorRatings,
                sumAuthorRatings: player.sumAuthorRatings,
                sumAuthorRatingWeights: player.sumAuthorRatingWeights,
                searchable: player.searchable })

    if (follower) {
      if (!player.noMailUnlessFollowed)
        status.reachable = true

      var followPromise
      if (before)
        followPromise = Promise.resolve(true)
      else
        followPromise = Follow.find ({ or: [{ follower: follower.id, followed: player.id },
                                            { followed: follower.id, follower: player.id }] })
        .then (function (follows) {
          follows.forEach (function (follow) {
            if (follow.follower === follower.id && follow.followed === player.id)
              status.following = true
            else if (follow.followed === follower.id && follow.follower === player.id) {
              status.privateBio = player.privateBio
              status.reachable = true
            }
          })
        })
      
      var messagePromise
      if (messages) {
       var query = { or: [{ sender: player.id, recipient: follower.id, recipientDeleted: false },
                          { sender: follower.id, recipient: player.id, senderDeleted: false }] }
        if (before)
          query.id = { '<': before }
        messagePromise = Message.find (query)
          .sort ('id DESC')
          .limit (limit + 1)
          .then (function (msgs) {
            if (msgs.length > limit) {
              msgs.pop()
              status.more = true
            }
            status.messages = msgs.map (function (message) {
              var toFollower = message.recipient === follower
              return { id: message.id,
                       sender: message.sender,
                       body: message.body,
                       date: message.createdAt,
                       rating: toFollower ? message.rating : undefined }
            })
            var messagesToFollower = msgs.filter (function (m) { return m.recipient === follower })
            return Message.update ({ id: messagesToFollower.map (function (m) { return m.id }) },
                                   { read: true })
          }).then (function() {
            if (!before)
              return Draft.find ({ sender: follower.id,
                                   recipient: player.id })
              .sort('createdAt ASC')
              .limit(1)
              .then (function (drafts) {
                if (drafts.length) {
                  var draft = drafts[0]
                  status.draft = { id: draft.id,
                                   template: draft.template,
                                   vars: draft.initVarVal,
                                   body: draft.body }
                }
              })
          })
      }

      return followPromise
        .then (function() {
          return messagePromise
        }).then (function() {
          return status
        })
    } else {
      status.privateBio = player.privateBio
      return Promise.resolve (status)
    }
  },

  makePlayerSummary: function (player, following) {
    return { id: player.id,
             searchable: player.searchable,
             name: player.name,
             displayName: player.displayName,
	     twitterScreenName: player.twitterScreenName,
	     twitterAuthorized: player.twitterAccessTokenSecret ? true : false,
             reachable: !player.noMailUnlessFollowed,
             following: following }
  },

  makeLoginSummary: function (player) {
    return player && { id: player.id,
                       name: player.name,
                       displayName: player.displayName,
		       twitterScreenName: player.twitterScreenName,
		       twitterAuthorized: player.twitterAccessTokenSecret ? true : false,
                       hidePassword: (player.facebookId || player.twitterId) ? true : false,
                       noMailUnlessFollowed: player.noMailUnlessFollowed,
                       publicBio: player.publicBio,
                       privateBio: player.privateBio,
                       gender: player.gender
                     }
  },

  makeHomepage: function (playerID) {
    var homepagePromise, vars = { init: false }, result = { vars: vars }
    if (playerID)
      homepagePromise = Player.findOne({ id: playerID })
      .then (function (player) {
        if (player) {
          vars.init = true
          vars.initConfig = { player: PlayerService.makeLoginSummary (player) }
          result.player = player
        }
        return result
      })
    else
      homepagePromise = Promise.resolve (result)
    return homepagePromise
  },
  
  makeUniquePlayerName: function (prefix, count) {
    prefix = prefix.replace (/[^A-Za-z0-9_]/g, '')
    var suffix = (count || '').toString()
    var trialName = prefix.substr (0, Player.maxNameLen - suffix.length) + suffix
    return Player.find ({ name: trialName })
      .then (function (players) {
        if (players.length)
          return PlayerService.makeUniquePlayerName (prefix, (count || 0) + 1)
        return trialName
      })
  },

  sendMessage: function (config) {
    var playerID = config.playerID || null
    var recipientID = config.recipientID || null
    var player = config.player
    var recipient = null
    var template = config.template
    var title = config.title
    var body = config.body
    var previous = config.previous
    var tags = config.tags || ''
    var previousTags = config.previousTags || ''
    var draftID = Draft.parseID (config.draft)
    var isPublic = config.isPublic || false
    var result = {}, notification = {}, initVarVal, templateAuthor, previousTweeter, previousTweetId
    // check that the recipient is reachable
    var reachablePromise
    if (recipientID === null)
      reachablePromise = Promise.resolve()
    else
      reachablePromise = Follow.find ({ follower: recipientID,
                                        followed: playerID })
      .then (function (follows) {
        if (!follows.length)
          return Player.find ({ id: recipientID,
                                noMailUnlessFollowed: false })
          .then (function (players) {
            if (!players.length)
              throw new Error ("Recipient unreachable")
            recipient = players[0]
          })
      })
    return reachablePromise.then (function() {
      // find previous Message
      var previousPromise, previousTemplate
      if (typeof(previous) === 'undefined') {
        initVarVal = parseTree.defaultVarVal (player, recipient)
        previousPromise = Promise.resolve()
      } else {
        previousPromise = Message.findOne ({ id: previous })
        if (typeof(template.id) === 'undefined')
          previousPromise = previousPromise.populate ('template')
          .then (function (previousMessage) {
            previousTemplate = previousMessage.template
            return previousMessage
          })
        previousPromise = previousPromise
          .then (function (previousMessage) {
            initVarVal = parseTree.nextVarVal (previousMessage.body, previousMessage.initVarVal, player, recipient)
            previousTweeter = previousMessage.tweeter
            previousTweetId = previousMessage.tweetId
          })
      }
      // find, or create, the template
      var templatePromise
      if (typeof(template.id) !== 'undefined')
        templatePromise = previousPromise.then (function() {
          return Template.findOne ({ id: template.id,
                                     or: [{ author: playerID },
                                          { isPublic: true }] })
	    .populate ('author')
        })
      else {
        // impose limits
        SymbolService.imposeSymbolLimit ([template.content], Symbol.maxTemplateSyms)
        // use template from previous Message
        templatePromise = previousPromise.then (function (previousMessage) {
          // create the Template
          var content = template.content
          return Template.create ({ title: title,
                                    author: player,
                                    content: content,
                                    previous: previousTemplate,
                                    tags: tags.toLowerCase().split(/\s+/).filter (function (tag) { return tag !== '' }).join(' '),
                                    previousTags: ' ' + previousTags.toLowerCase() + ' ',
                                    isRoot: (previousTemplate ? false : true),
                                    isPublic: isPublic })
            .then (function (template) {
              // this is a pain in the arse, but Waterline's create() method unwraps single-element arrays (!??!?#$@#?) so we have to do an update() to be sure
              return Template.update ({ id: template.id },
                                      { content: content })
                .then (function() {
                  return template
                })
            })
        })
      }
      return templatePromise.then (function (template) {
        result.template = { id: template.id }
	templateAuthor = template.author
        // create the Message
        return Message.create ({ sender: playerID,
                                 recipient: recipientID,
                                 isBroadcast: !recipientID,
                                 template: template,
                                 previous: previous,
                                 title: title,
                                 initVarVal: initVarVal,
				 tweeter: templateAuthor ? templateAuthor.twitterScreenName : null,
                                 body: body })
      }).then (function (message) {
        result.message = { id: message.id }
        notification.id = message.id
        if (recipientID === null) {
          result.message.path = '/m/' + result.message.id  // broadcast, so give sender a URL to advertise
          notification.title = message.title || parseTree.summarizeExpansion (message.body)
          notification.sender = (player
                                 ? { id: playerID,
                                     displayName: player.displayName }
                                 : undefined)
          notification.date = message.createdAt
        }
        // delete the Draft
        var draftPromise
        if (draftID)
          draftPromise = Draft.destroy ({ id: draftID,
                                          sender: playerID })
        else
          draftPromise = Promise.resolve()
        return draftPromise
	  .then (function() {
	    // send a tweet
	    var tweetPromise
	    if (templateAuthor && templateAuthor.twitterAccessTokenSecret) {
	      var twitter = new twitterAPI({
		consumerKey: sails.config.local.twitter.consumerKey,
		consumerSecret: sails.config.local.twitter.consumerSecret
	      })
	      tweetPromise = new Promise (function (resolve, reject) {
		var tweet = {}
		var status = parseTree.makeExpansionText (body, false, initVarVal)
		if (previousTweetId) {
		  tweet.in_reply_to_status_id = previousTweetId
                  tweet.auto_populate_reply_metadata = true
                  status = '@' + previousTweeter + ' ' + status
                }
		if (recipientID === null) {
		  var url = (sails.config.local.baseURL || 'http://localhost:1337') + result.message.path
		  var statusWithUrl = status + (status.match(/\s$/) ? '' : ' ') + url
		  if (statusWithUrl.length < 280)  // 280 is Twitter length limit. Should probably not hardcode this in here
		    status = statusWithUrl
		}
                tweet.status = status
		twitter.statuses ("update",
				  tweet,
				  templateAuthor.twitterAccessToken,
				  templateAuthor.twitterAccessTokenSecret,
				  function (error, data, response) {
				    if (error) {
				      console.warn (error)
				      resolve()  // plough ahead, even if the Twitter API doesn't work
				    } else {
				      resolve (data)
				    }
				  })
	      })
	    } else
	      tweetPromise = Promise.resolve()
	    return tweetPromise
	      .then (function (tweetData) {
		if (tweetData) {
		  var tweetId = tweetData.id_str
		  result.message.tweet = tweetId
		  return Message.update ({ id: message.id },
					 { tweetId: tweetId })
		}
	      })
	  })
      }).then (function() {
        if (recipientID === null)
          sails.sockets.broadcast ('news', notification)  // send the good news to everyone
        else {
          notification.message = 'incoming'
          Player.message (recipientID, notification)    // send the good news to recipient
        }
        return result
      })
    })
  }
}
