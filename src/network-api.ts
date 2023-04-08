const querystring = require('querystring');
import crypto, { randomUUID as uuid } from 'crypto'
import EventSource from 'eventsource'
import { CookieJar, Cookie } from 'tough-cookie'
import FormData from 'form-data'
import { setTimeout as setTimeoutAsync } from 'timers/promises'
import util from 'util'
import { texts, ReAuthError, FetchOptions } from '@textshq/platform-sdk'

import { TwitterError } from './errors'
import { chunkBuffer } from './util'
import type { SendMessageVariables } from './twitter-types'

const { constants, IS_DEV, Sentry } = texts
const { USER_AGENT } = constants

const randomBytes = util.promisify(crypto.randomBytes)

const MAX_RETRY_COUNT = 5

const Encode = require('./encode')
const Decode = require('./decode')

const staticFetchHeaders = {
  'accept': '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  'content-type': 'application/grpc-web+proto',
  'pragma': 'no-cache',
  'sec-ch-ua': '\'Google Chrome\';v=\'113\', \'Chromium\';v=\'113\', \'Not-A.Brand\';v=\'24\'',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '\'macOS\'',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'x-grpc-web': '1',
  // 'x-snap-device-info': 'CggKBAgMEA0QBBICCAcaBzEyLjEzLjA=',
  'x-user-agent': 'grpc-web-javascript/0.1'
}

const API_ENDPOINT = 'https://web.snapchat.com/'
const GRAPHQL_ENDPOINT = 'https://web.snapchat.com/web-calling-api/graphql'

export default class SnapchatAPI {
  sessionCookie: string = ''
  nonceCookie: string = ''
  private BEARER_TOKEN: string = ''
  private userInfoCache: any = []

  genAuthToken = async () => {
    if (!this.sessionCookie || !this.nonceCookie) throw new Error('Snapchat missing authentication cookies')

    let req = await fetch('https://accounts.snapchat.com/accounts/sso?client_id=web-calling-corp--prod', {
      headers: {
        'pragma': 'no-cache',
        'cache-control': 'no-cache',
        'origin': 'https://web.snapchat.com',
        'cookie': `__Host-sc-a-session=${this.sessionCookie}; __Host-sc-a-nonce=${this.nonceCookie};`,
      },
      method: 'POST'
    })
    let res = await req.text();
    if (res.length !== 265) throw new Error('Couldn\'t fetch snapchat auth token');
    this.BEARER_TOKEN = res;
  }

  fetch = async (options: any, retryNumber = 0, responseType='json') => {
    if (!this.BEARER_TOKEN) await this.genAuthToken()

    let req = await fetch(options.url, {
      headers: {
        'authorization': `Bearer ${this.BEARER_TOKEN}`,
        'cookie': `sc-a-nonce=${this.nonceCookie}`,
        ...staticFetchHeaders
      },
      body: options.body,
      method: 'POST'
    })

    let res = responseType === 'json' ? await req.text() : await req.arrayBuffer();
    // @ts-ignore
    let unauthorized = (responseType === 'json' ? res : [...new Uint8Array(res).slice(0, 12)].map(x => String.fromCharCode(x)).join(''))  === 'unauthorized';

    if (unauthorized) {
      if (retryNumber > 0) throw new Error('Snapchat request unauthorized')

      // generate new bearer token and retry request
      await this.genAuthToken()
      return this.fetch(options, retryNumber + 1)
    }

    // @ts-ignore
    if (responseType === 'json') res = JSON.parse(res);
    return res;
  }

  userInfo = () =>
    this.fetch({
      url: GRAPHQL_ENDPOINT,
      body: '{\"operationName\":\"User\",\"variables\":{},\"query\":\"query User {\\n  user {\\n    id\\n    bitmojiAvatarId: bitmojiAvatarID\\n    bitmojiSelfieId: bitmojiSelfieID\\n    bitmojiBackgroundId: bitmojiBackgroundID\\n    bitmojiSceneId: bitmojiSceneID\\n    isEmployee\\n    username\\n    displayName\\n    snapPrivacy\\n    hasUserSeenDWeb\\n  }\\n}\"}'
    })

  // TODO: multiple ids at once
  getUserInfo = async (userId, friendInfo) => {
    let users = friendInfo?.friends?.filter(x => x.user_id === userId);

    if (!users || users.length === 0) users = this.userInfoCache?.filter(x => x.user_id === userId);

    if (!users || users.length === 0) {
      let params = {
        user_ids: JSON.stringify([userId]),
        source: 'CHAT'
      };

      let req = await fetch('https://web.snapchat.com/loq/snapchatter_public_info', {
        'headers': {
          'authorization': `Bearer ${this.BEARER_TOKEN}`,
          'cookie': `sc-a-nonce=${this.nonceCookie}`,
          ...staticFetchHeaders,
          'content-type': 'application/x-www-form-urlencoded; charset=utf-8'
        },
        'body': querystring.stringify(params),
        'method': 'POST'
      });

      let {snapchatters} = await req.json();

      users = snapchatters || []
      if (!users || users.length !== 0) this.userInfoCache.push(...snapchatters);
    }

    if (!users || users.length === 0) users = [{mutable_username: 'unknown', display: 'unknown'}];

    return {id: userId, ...users[0]};
    // return {
    //   id: userId,
    //   username: users[0].mutable_username,
    //   name: users[0].display,
    //   bitmojiSelfieId: users[0].bitmoji_selfie_id,
    //   bitmojiAvatarId: users[0].bitmoji_avatar_id
    // };
  }

  getFriends = async (userId) => {
    let params = {
      snapchat_user_id: userId,
      timestamp: Date.now(),
      friends_request: JSON.stringify({})
    };

    let req = await fetch('https://web.snapchat.com/ami/friends', {
      'headers': {
        'authorization': `Bearer ${this.BEARER_TOKEN}`,
        'cookie': `sc-a-nonce=${this.nonceCookie}`,
        ...staticFetchHeaders
      },
      'body': querystring.stringify(params),
      'method': 'POST'
    });
    return await req.json();
  }

  getThreads = (userId, friendInfo) => {
    return this.QueryConversations(userId, friendInfo)
  }

  getMessages = (threadID, pagination, userId) => {
    return this.QueryMessages(threadID, pagination?.cursor, userId)
  }

  

  decryptMedia = async ({assetId, encryptionKey, encryptionIV}, cdn=0, retries=0) => {
    const cipher = 'AES-CBC';

    // TODO: figure out which CDN to use. probably in the metadata.

    // TODO: find all CDNs (or complete above todo)
    // loops through CDNs until it gets a response.
    const CDNs = [
      'https://cf-st.sc-cdn.net/c',
      'https://cf-st.sc-cdn.net/d',
      'https://bolt-gcdn.sc-cdn.net/3',
      'https://cf-st.sc-cdn.net/a',
      'https://cf-st.sc-cdn.net/b', // assuming this exists
      'https://bolt-gcdn.sc-cdn.net/1', // assuming this exists
      'https://bolt-gcdn.sc-cdn.net/2', // assuming this exists
      'https://bolt-gcdn.sc-cdn.net/4' // assuming this exists
    ];

    if (cdn >= CDNs.length) {
      // TODO: V1 encryption
      console.log(`Snapchat decryptMedia: couldn\'t fetch media with id: "${assetId}" - likely missing CDN`);
      return undefined;
    }

    const staticHeaders = {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "sec-ch-ua": "\"Google Chrome\";v=\"111\", \"Not(A:Brand\";v=\"8\", \"Chromium\";v=\"111\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"macOS\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "Referer": "https://web.snapchat.com/",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      };

    let req, encryptedMedia;
    try {
      req = await fetch(`${CDNs[cdn]}/${assetId}?uc=4`, { headers: staticHeaders });
      encryptedMedia = await req.arrayBuffer();
    } catch (e) {
      if (e.code === 'ENOTFOUND' && retries === 0)
        return this.decryptMedia({assetId, encryptionKey, encryptionIV}, cdn, retries + 1);

      console.log(`Snapchat decryptMedia: fatal fetch error`, e);
      return undefined;
    }

    try {
      // @ts-ignore
      let key = await crypto.subtle.importKey('raw', new Uint8Array(encryptionKey), cipher, false, ['decrypt'])

      // @ts-ignore
      let decrypted = await crypto.subtle.decrypt({
        iv: new Uint8Array(encryptionIV),
        name: cipher
      }, key, encryptedMedia)

      if (!(decrypted instanceof ArrayBuffer)) {
        console.log(`Snapchat decryptMedia: expected decryption result should be ArrayBuffer`);
        return undefined;
      }

      return decrypted;
    } catch (err) {

      // access denied error -- likely wrong CDN
      let responseString = [...new Uint8Array(encryptedMedia)].map(c => String.fromCharCode(c)).join('');
      let xmlResponse = responseString.substring(0, 5) == '<?xml';
      if (xmlResponse)
        return this.decryptMedia({assetId, encryptionKey, encryptionIV}, cdn + 1);

      console.log(`Snapchat decryptMedia: couldn\'t decrypt media with id: "${assetId}" - assuming V1 encryption`);
      return undefined;
    }
  }

  sendText = async (threadID, text, senderId) => {
    let body = await Encode.CreateContentMessage(text, threadID, senderId);
    let req = await fetch('https://web.snapchat.com/messagingcoreservice.MessagingCoreService/CreateContentMessage', {
      'headers': {
        'authorization': `Bearer ${this.BEARER_TOKEN}`,
        'cookie': `sc-a-nonce=${this.nonceCookie}`,
        ...staticFetchHeaders
      },
      'referrerPolicy': 'strict-origin-when-cross-origin',
      'body': body,
      'method': 'POST'
    });
    return await req.text();
  }

  QueryMessages = async (convoId, cursor, userId) => {
    const formatSnapId = id => `${id.substr(0, 8)}-${id.substr(8, 4)}-${id.substr(12, 4)}-${id.substr(16, 4)}-${id.substr(20)}`;
    const parseBitmojiName = str => {
      // shouldn't need to parse. inconsistency between .proto file and protobuf decoder. also missing a numeric field here
      return str?.split(/[\x01\x1A\x12\(\n]/)?.filter(x => x);
    }
    let body = await Encode.QueryMessages(convoId, userId, cursor);
    // console.log([...body]);
    let req = await fetch('https://web.snapchat.com/messagingcoreservice.MessagingCoreService/QueryMessages', {
      'headers': {
        'authorization': `Bearer ${this.BEARER_TOKEN}`,
        'cookie': `sc-a-nonce=${this.nonceCookie}`,
        ...staticFetchHeaders
      },
      'referrerPolicy': 'strict-origin-when-cross-origin',
      'body': body,
      'method': 'POST'
    });

    if (req.status === 429) {
      // TODO: handle rate limiting
    }

    let buf = await req.arrayBuffer();
    let json;
    try {
      // console.log('begin decode');
    // console.log([...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join(' '));
      json = await Decode.QueryMessages(buf);
    } catch (e) {
      console.log("DECODE FAILED FOR:")
      console.log([...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join(' '));
      // console.log(e);
      // WRONG DATA TYPE USED FOR CURSOR.
      // for now, assume that if this didn't work then there weren't messages
      // return [];
    }
    json = Decode.select('messages', json);
    if (!json) {
      // WRONG DATA TYPE USED FOR CURSOR.
      // for now, assume that if this didn't work then there weren't messages
      return [];
    }
    json = await Promise.all(json.map(async msg => {
      let snapWebMessage = Decode.select('snapWebMessage', msg) !== null;
      let textContent = Decode.select('textContent', msg);
      let slideupText = Decode.select('slideupText', msg);
      let savedFromUser = Decode.select('savedFromUser', msg);
      if (!textContent && savedFromUser) {
        let uid = formatSnapId(atob(savedFromUser).split('').map(x => x.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
        savedFromUser = await this.getUserInfo(uid, {});
        textContent = `[saved photo from ${savedFromUser.display_name.toLowerCase()}]`; // temporary
      }

      let snapType = Decode.select('snapType', msg);
      if (!textContent && snapType) {
        textContent = `[(unknown snapType: ${snapType})]`;
        if (atob(snapType) === atob('EAE=')) {
          let seenByInfo = Decode.select('seenByInfo', msg);
          // seenByInfo._1[0] is time sent and _2[0] is another time (first open by anyone?)
          let seenByUsers = Decode.select('seenByUsers', seenByInfo)
          textContent = `[image snap sent. seen by ${seenByUsers?.length || 0}]`;
        } else if (atob(snapType) === atob('CAEQAQ==')) {
          let seenByInfo = Decode.select('seenByInfo', msg);
          // seenByInfo._1[0] is time sent and _2[0] is another time (first open by anyone?)
          let seenByUsers = Decode.select('seenByUsers', seenByInfo)
          textContent = `[video snap sent. seen by ${seenByUsers?.length || 0}]`;
        }
      } else if (slideupText) {
        textContent = `[slid up on story with message: ${slideupText}]`;
      } else if (!textContent) {
        // something before each attachment?
        // console.log('[nothing]', msg)
        // textContent = '[nothing]';
      }

      let isAction = false;
      let isDeleted = false;
      let isHidden = false;

      let deleteType = Decode.select('deleteType', msg);
      if (deleteType === '1' || deleteType === '2') {
        textContent = 'chat deleted';
        isDeleted = true;
        if (deleteType === '2') textContent = 'snap deleted';
      }

      let reactions = Decode.select('reactions', msg);
      if (reactions) reactions = reactions.map(r => {
        return {
          senderId: formatSnapId(atob(r._1[0]._1[0]).split('').map(x => x.charCodeAt(0).toString(16).padStart(2, '0')).join('')),
          reaction_key: r._2[0]._1[0],
          messageNumber: parseInt(r._3[0])
        }
      });

      // this is *probably* the "X is using Snapchat for web" message
      if (snapWebMessage) isHidden = true;
      return {
        isAction: isAction,
        isDeleted: isDeleted,
        isHidden: isHidden,
        reactions: reactions || false,
        repliedTo: parseInt(Decode.select('repliedTo', msg)) || false,
        snapWebMessage: snapWebMessage,
        messageNumber: parseInt(Decode.select('messageNumber', msg)),
        senderId: formatSnapId(atob(Decode.select('senderId', msg)).split('').map(x => x.charCodeAt(0).toString(16).padStart(2, '0')).join('')),
        // convoId: formatSnapId(atob(Decode.select('convoId', msg)).split('').map(x => x.charCodeAt().toString(16)).join('')),
        textContent: textContent,
        timestamp: Decode.select('timestamp', msg),
        
        // // guessing that mysteryId is really messageId, and messageId is useless?
        // messageId: parseInt(Decode.select('messageIdProbably', msg)) || 'none?',
        // mysteryId: (() => {
        //   try {
        //     // not sure about _9[0]_1[0]_1[0]
        //     let x = formatSnapId(atob(msg?._9[0]?._1[0]?._1[0]).split('').map(x => x.charCodeAt(0).toString(16)).join('')); // maybe this is the message id?
        //     return x;
        //   } catch (e) {
        //     try {
        //       // not sure about indexing
        //       return msg._9[0]._2[0];
        //     } catch (e) {
        //       return 'none?';
        //     }
        //   }
        // })(),

        assets: await (async () => {
          let assetInfo = Decode.select('assetInfo', msg);
          let assetEncryptionInfo = Decode.select('assetEncryptionInfo', msg);

          if (!assetInfo || !assetEncryptionInfo) return [];
          if (assetInfo.length !== assetEncryptionInfo.length) {
            return [];
          }

          let arr = [];
          for (let i = 0; i < assetInfo.length; i++) {
            let asset = {} as any;
            asset.assetId = atob(Decode.select('assetId', assetInfo[i]));
            asset.encryptionKey = atob(Decode.select('encryptionKey', assetEncryptionInfo[i])).split('').map(x => x.charCodeAt(0));
            asset.encryptionIV = atob(Decode.select('encryptionIV', assetEncryptionInfo[i])).split('').map(x => x.charCodeAt(0));

            asset.type = 'UNKNOWN';
            // asset.type = 'IMG';

            // TODO: examine this
            if (JSON.stringify(asset.encryptionKey) ==  JSON.stringify([158, 233, 101])) {
              console.log("caught-early");
              return arr;
            }

            // Some images can't be decrypted. Assuming they are using encryptionInfoV1/outdated clients bc error decodes are from the same senders
            try {
              let decrypted = await this.decryptMedia(asset);
              let magicBytesStr = [...new Uint8Array(decrypted)].slice(0, 10).map(x => x.toString(16).padStart(2, '0')).join(' ');


              if (magicBytesStr.indexOf('ff d8 ff') === 0) asset.type = 'IMG'; // jpeg
              if (magicBytesStr.indexOf('89 50 4e') === 0) asset.type = 'IMG'; // png
              if (magicBytesStr.indexOf('66 74 79') === 0) asset.type = 'VIDEO'; // mp4
              if (magicBytesStr.indexOf('66 74 79 70') === 0) asset.type = 'VIDEO'; // mov?
              if (magicBytesStr.indexOf('52 49 46') === 0) asset.type = 'AUDIO'; // wav
              if (magicBytesStr.indexOf('49 44 33') === 0) asset.type = 'AUDIO'; // mp3
              if (magicBytesStr.indexOf('ff fb') === 0) asset.type = 'AUDIO'; // mp3
              if (magicBytesStr.indexOf('ff f3') === 0) asset.type = 'AUDIO'; // mp3
              if (magicBytesStr.indexOf('ff f2') === 0) asset.type = 'AUDIO'; // mp3

              if (magicBytesStr.indexOf('00 00 00 1c') === 0) asset.type = 'VIDEO'; // snap video

              // 50 4b 03 04 // zip file?
              // if (asset.type === 'UNKNOWN') console.log(magicBytesStr)

              asset.b64 = Buffer.from(decrypted).toString('base64');
            } catch(e) {
              console.log('Snapchat media error', e);
            }

            arr.push(asset);
          }
          return arr;
        })(),
        original: msg
      };
    }));
    return json;
  }

  QueryConversations = async (userId: string, friendInfo: any) => {
    const formatSnapId = id => `${id.substr(0, 8)}-${id.substr(8, 4)}-${id.substr(12, 4)}-${id.substr(16, 4)}-${id.substr(20)}`;
    let body = await Encode.QueryConversations(userId);
    let req = await fetch('https://web.snapchat.com/messagingcoreservice.MessagingCoreService/QueryConversations', {
      'headers': {
        'authorization': `Bearer ${this.BEARER_TOKEN}`,
        'cookie': `sc-a-nonce=${this.nonceCookie}`,
        ...staticFetchHeaders
      },
      'referrerPolicy': 'strict-origin-when-cross-origin',
      'body': body,
      'method': 'POST'
    });
    let buf = await req.arrayBuffer();
    let json = await Decode.SyncConversations(buf);

    let dict = {
      // obj is SyncConversationsResponse
      'conversations': '_1',

      // obj is conversation
      'convoId': '_1[0]_1[0]_1[0]',
      'userIds': '_7',
      'gcName': '_9[0]', // if any

      // obj is single userId
      'id': '_1[0]',
      // 'userId1': '_7[0]_1[0]',
      // 'userId2': '_7[1]_1[0]',
      'lastActive': '_3[0]'
    };
    json = Decode.select('conversations', json, dict);
    json = await Promise.all(json.map(async x => {
      let ids = Decode.select('userIds', x, dict);
      let name = Decode.select('gcName', x, dict);
      let userIds = ids.map(i => formatSnapId(atob(Decode.select('id', i, dict)).split('').map(x => x.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
      let participants = await Promise.all(userIds.map(x => this.getUserInfo(x, friendInfo)));
      let displayNames = participants.filter(x => x.id !== userId).map(x => x.display ? x.display : x.mutable_username);
      return {
        convoId: formatSnapId(atob(Decode.select('convoId', x, dict)).split('').map(x => x.charCodeAt(0).toString(16).padStart(2, '0')).join('')),
        participants: participants,
        name: name ? atob(name) : displayNames.join(', '),
        original: x,
        lastTimestamp: parseInt(Decode.select('lastActive', x, dict))
      }
    }));
    return json;
  }

  // SyncConversations = async (userId: string, friendInfo: any) => {
  //   const formatSnapId = id => `${id.substr(0, 8)}-${id.substr(8, 4)}-${id.substr(12, 4)}-${id.substr(16, 4)}-${id.substr(20)}`;
  //   let body = await Encode.SyncConversations(userId);
  //   let req = await fetch('https://web.snapchat.com/messagingcoreservice.MessagingCoreService/SyncConversations', {
  //     'headers': {
  //       'authorization': `Bearer ${this.BEARER_TOKEN}`,
  //       'cookie': `sc-a-nonce=${this.nonceCookie}`,
  //       ...staticFetchHeaders
  //     },
  //     'referrerPolicy': 'strict-origin-when-cross-origin',
  //     'body': body,
  //     'method': 'POST'
  //   });
  //   let buf = await req.arrayBuffer();
  //   let json = await Decode.SyncConversations(buf);

  //   let dict = {
  //     // obj is SyncConversationsResponse
  //     'conversations': '_1',

  //     // obj is conversation
  //     'convoId': '_1[0]_1[0]_1[0]',
  //     'userIds': '_7',
  //     'gcName': '_9[0]', // if any

  //     // obj is single userId
  //     'id': '_1[0]',
  //     // 'userId1': '_7[0]_1[0]',
  //     // 'userId2': '_7[1]_1[0]',
  //   };
  //   json = Decode.select('conversations', json, dict);
  //   json = await Promise.all(json.map(async x => {
  //     let ids = Decode.select('userIds', x, dict);
  //     let name = Decode.select('gcName', x, dict);
  //     let userIds = ids.map(i => formatSnapId(atob(Decode.select('id', i, dict)).split('').map(x => x.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
  //     let participants = await Promise.all(userIds.map(x => this.getUserInfo(x, friendInfo)));
  //     let displayNames = participants.filter(x => x.id !== userId).map(x => x.display ? x.display : x.mutable_username);
  //     return {
  //       convoId: formatSnapId(atob(Decode.select('convoId', x, dict)).split('').map(x => x.charCodeAt(0).toString(16).padStart(2, '0')).join('')),
  //       participants: participants,
  //       name: name ? atob(name) : displayNames.join(', '),
  //       original: x
  //     }
  //   }));
  //   return json;
  // }
}
