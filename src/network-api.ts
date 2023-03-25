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
  'x-snap-device-info': 'CggKBAgMEA0QBBICCAcaBzEyLjEzLjA=',
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

    if (users.length === 0) users = this.userInfoCache?.filter(x => x.user_id === userId);

    if (users.length === 0) {
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
      if (users.length !== 0) this.userInfoCache.push(...snapchatters);
    }

    if (users.length === 0) users = [{mutable_username: 'unknown', display: 'unknown'}];

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
    return this.SyncConversations(userId, friendInfo)
  }

  getMessages = (threadID, pagination, userId) => {
    return this.QueryMessages(threadID, pagination, userId)
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

  QueryMessages = async (convoId, pagination, userId) => {
    const formatSnapId = id => `${id.substr(0, 8)}-${id.substr(8, 4)}-${id.substr(12, 4)}-${id.substr(16, 4)}-${id.substr(20)}`;
    const parseBitmojiName = str => {
      // shouldn't need to parse. inconsistency between .proto file and protobuf decoder. also missing a numeric field here
      return str?.split(/[\x01\x1A\x12\(\n]/)?.filter(x => x);
    }
    let body = await Encode.QueryMessages(convoId, userId);
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
    let buf = await req.arrayBuffer();
    let json;
    // try {
      // console.log('begin decode');
    // console.log([...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join(' '));
      json = await Decode.QueryMessages(buf);
    // } catch (e) {
      // console.log(e);
      // WRONG DATA TYPE USED FOR CURSOR.
      // for now, assume that if this didn't work then there weren't messages
      // return [];
    // }
    json = Decode.select('messages', json);
    if (!json) {
      // WRONG DATA TYPE USED FOR CURSOR.
      // for now, assume that if this didn't work then there weren't messages
      return [];
    }
    json = json.map(msg => {
      return {
        messageNumber: parseInt(Decode.select('messageNumber', msg)),
        senderId: formatSnapId(atob(Decode.select('senderId', msg)).split('').map(x => x.charCodeAt(0).toString(16).padStart(2, '0')).join('')),
        // convoId: formatSnapId(atob(Decode.select('convoId', msg)).split('').map(x => x.charCodeAt().toString(16)).join('')),
        textContent: Decode.select('textContent', msg),
        timestamp: Decode.select('timestamp', msg),
        
        // guessing that mysteryId is really messageId, and messageId is useless?
        messageId: parseInt(Decode.select('messageIdProbably', msg)) || 'none?',
        mysteryId: (() => {
          try {
            // not sure about _9[0]_1[0]_1[0]
            let x = formatSnapId(atob(msg?._9[0]?._1[0]?._1[0]).split('').map(x => x.charCodeAt(0).toString(16)).join('')); // maybe this is the message id?
            return x;
          } catch (e) {
            try {
              // not sure about indexing
              return msg._9[0]._2[0];
            } catch (e) {
              return 'none?';
            }
          }
        })(),

        assets: (() => {
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
            arr.push(asset);
          }
          return arr;
        })(),
        original: msg
      };
    });
    return json;
  }

  SyncConversations = async (userId: string, friendInfo: any) => {
    const formatSnapId = id => `${id.substr(0, 8)}-${id.substr(8, 4)}-${id.substr(12, 4)}-${id.substr(16, 4)}-${id.substr(20)}`;
    let body = await Encode.SyncConversations(userId);
    let req = await fetch('https://web.snapchat.com/messagingcoreservice.MessagingCoreService/SyncConversations', {
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
        original: x
      }
    }));
    return json;
  }
}
