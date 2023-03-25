const protobuf = require('protobufjs');

const parseHexString = str => str.replaceAll('-', '').replaceAll(' ', '').match(/.{2}/g).map(x => parseInt(x, 16));

const MAX_INT = 2 ** 63;
const randomUUID = () => Math.round(Math.random() * MAX_INT);

const SNAP_PROTO = `// https://web.snapchat.com/messagingcoreservice.MessagingCoreService/QueryMessages
package snap;
syntax = "proto3";

/* HAND CREATED */

message SyncConversations {
  message a1 {
    required bytes userId = 1;
  }
  required a1 _1 = 1;

  message a3 {
    optional fixed32 _14 = 14;

    // this ^^ [or] vv

    message a4 {
      optional int64 _2 = 2;
      optional int64 _3 = 3;
    }
    optional a4 _1 = 1;

    message a7 {
      message a8 {
        optional bytes _1 = 1;
      }
      optional a8 _1 = 1;

      message aa {
        optional int64 _0 = 0;
        optional int64 _1 = 1;
      }
      optional aa _2 = 2;

    }
    optional a7 _3 = 3;

    optional int64 _4 = 4;
    optional int64 _5 = 5;
    optional int64 _6 = 6;
  }
  required a3 _2 = 2;

}

// (delete message)
message UpdateContentMessage {
  required int64 _1 = 1; // unsure. (ex: 14753658323434643773, 3597905676753139998)
  required int64 _2 = 2; // unsure. increments. (2142 -> 2143)
  message a3 {
    message a4 {
      required bytes userId = 1;
    }
    required a4 _1 = 1;

    required int64 messageNumber = 2;
    message a7 {
      required bytes convoId = 1;
    }
    required a7 _3 = 3;

    required bytes empty = 8;
    required int64 deletionTimestamp = 14;
  }
  required a3 _3 = 3;

}

message QueryMessages {
  required sint64 cursor = 1; // assuming cursor
  required Bytes convoInfo = 2;
  required int64 numMessages = 3;
  required Bytes userId = 4;
}

message QueryMessagesResponse {
  repeated int64 a = 0;
  repeated Message message = 1;
  optional int64 b = 2;
}

message Message {
  required int64 messageNumber = 1; // increments, first saved message = 1
  required Bytes senderUserId = 2;

  message DoubleBytesParent {
    required bytes a = 99;

    message Convo {
      required Bytes id = 1;
      required int64 a = 2;
    }
    required Convo convoInfo = 1;
  }
  required DoubleBytesParent convoInfo = 3;

  message MessageInfo {
    message BytesParent {
      optional String str = 2;
      // optional BitmojiParent bitmojiContent = 4;
      optional Bitmoji bitmojiContent = 4; // something weird is happening here
    }
    // message BitmojiParent {
    //   optional Bitmoji bitmoji = 4;
    // }
    message Bitmoji {
      optional string name = 1;
      optional string info = 2;
      optional int64 a = 5;
    }
    optional int64 a = 2;
    optional String b = 3;
    optional BytesParent textContent = 4;
    required string c = 6;
    required int64 d = 7;
  }
  required MessageInfo messageInfo = 4;

  message UserInfo {
    required int64 date1 = 1;
    optional int64 date2 = 2;
    optional Bytes userId = 6;
    required int64 a = 11;
  }
  required UserInfo userInfo = 6;
  optional int64 b = 7; // message uuid?

  message BytesParentParent {
    optional Bytes bytes = 1;
  }
  required BytesParentParent mysteryBytes = 9;
}

message CreateContentMessage {
  required Bytes userId = 1;
  required uint64 uuid = 2;
  required ConvoInfoParent convoInfo = 3;
  required ContentInfo content = 4;
}

message ContentInfo {
  required int64 a = 2;
  required StringParent content = 4;
  required int64 b = 7;
  
}

message ConvoInfoParent {
  required ConvoInfo info = 1;
}

message ConvoInfo {
  required Bytes id = 1;
  required int64 number = 2;
}

message StringParent {
  required String str = 2;
}

message String {
  optional string str = 1;
}


message Bytes {
  required bytes bytes = 1;
}
`

async function SyncConversations(userId) {
  // let root = await protobuf.load('snap.proto')
  let root = protobuf.parse(SNAP_PROTO).root;
  const Schema = root.lookupType('snap.SyncConversations');
  const payload = {
    _1: {
      userId: parseHexString(userId)
    },
    _2: {
      _14: 861300083 // 'useV3'
    }
  };

  let err = Schema.verify(payload);
  if (err) throw Error(err);

  let message = Schema.create(payload);
  Schema.encodeDelimitedPadding = message => {
    let messageBuffer = Schema.encode(message).finish();
    let prefix = parseHexString(messageBuffer.length.toString(16).padStart(10, '0'));
    return Buffer.from([...prefix, ...messageBuffer]);
  }
  let buffer = Schema.encodeDelimitedPadding(message);

  // console.log([...buffer].map(x => x.toString(16).padStart(2, '0')).join(' '));
  return buffer;
}

async function UpdateContentMessage(messageNumber, convoId, userId) {
  let root = await protobuf.load('snap.proto')
  const Schema = root.lookupType('snap.UpdateContentMessage');
  const payload = {
    _1: 14753658323434643773,
    _2: 2144,
    _3: {
      _1: {
        userId: parseHexString(userId)
      },
      messageNumber: parseInt(messageNumber),
      _3: {
        convoId: parseHexString(convoId)
      },
      empty: '',
      deletionTimestamp: Date.now()
    }
  };

  let err = Schema.verify(payload);
  if (err) throw Error(err);

  let message = Schema.create(payload);
  // console.log(JSON.stringify(message));
  Schema.encodeDelimitedPadding = message => {
    let messageBuffer = Schema.encode(message).finish();
    let prefix = parseHexString(messageBuffer.length.toString(16).padStart(10, '0'));
    return Buffer.from([...prefix, ...messageBuffer]);
  }
  let buffer = Schema.encodeDelimitedPadding(message);
  return buffer;
}
async function CreateContentMessage(text='test', convoId, userId) {
  // let root = await protobuf.load('snap.proto')
  let root = protobuf.parse(SNAP_PROTO).root;

  const Schema = root.lookupType('snap.CreateContentMessage');

  const payload = {
    userId: {
      bytes: parseHexString(userId)
    },
    uuid: randomUUID(),
    convoInfo: {
      info: {
        id: {
          bytes: parseHexString(convoId)
        },
        number: 1204 // message counter?
      }
    },
    content: {
      a: 1, // unknown
      content: {
        str: {
          str: text
        }
      },
      b: 2 // unknown
    }
  };

  let err = Schema.verify(payload);
  if (err) throw Error(err);

  let message = Schema.create(payload);

  Schema.decodeDelimitedPadding = buffer => {
    let sliceIdx = buffer[0] == 0 ? 5 : 0;
    return Schema.decode(buffer.slice(sliceIdx));
  }
  Schema.encodeDelimitedPadding = message => {
    let messageBuffer = Schema.encode(message).finish();
    let prefix = parseHexString(messageBuffer.length.toString(16).padStart(10, '0'));
    return Buffer.from([...prefix, ...messageBuffer]);
  }


  let buffer = Schema.encodeDelimitedPadding(message);

  // let buffer = Buffer.from(parseHexString('00000000590a120a10a04773145e5641fe9f6e2741b62495a010a785b0c7aeef91b1c7011a190a170a120a10f8e18e35469d5671983dbc31bce123da10b409221d1001221712150a13427279736f6e20736d656c6c73204c4f4c21233802'));
  // console.log(buffer);
  // message = CreateContentMessage.decodeDelimitedPadding(buffer);
  // console.log(message);
  
  return buffer;
}

async function QueryMessages(convoId, userId) {
  // let root = await protobuf.load('snap.proto');
  let root = protobuf.parse(SNAP_PROTO).root;

  const Schema = root.lookupType('snap.QueryMessages');
  // const Schema = root.lookupType('snap.QueryMessagesResponse');

  const payload = {
    userId: {
      bytes: parseHexString(userId)
    },
    cursor: -4611686018427387904, // goes backwards?
    convoInfo: {
      bytes: parseHexString(convoId)
    },
    numMessages: 100
  };
  // console.log("PAYLOAD", JSON.stringify(payload))

  let err = Schema.verify(payload);
  if (err) throw Error(err);

  let message = Schema.create(payload);

  Schema.decodeDelimitedPadding = buffer => {
    let sliceIdx = buffer[0] == 0 ? 5 : 0;
    return Schema.decode(buffer.slice(sliceIdx));
  }
  Schema.encodeDelimitedPadding = message => {
    let messageBuffer = Schema.encode(message).finish();
    let prefix = parseHexString(messageBuffer.length.toString(16).padStart(10, '0'));
    return Buffer.from([...prefix, ...messageBuffer]);
  }

  //
  // let body = Schema.encodeDelimitedPadding(message);
  // console.log([...body].map(x => x.toString(16).padStart(2, '0')).join(' '));
  //
  
  // console.log("ENCODED", [...new Uint8Array(Schema.encodeDelimitedPadding(message))].map(x => x.toString(16).padStart(2, '0')).join(' '))
  return Schema.encodeDelimitedPadding(message);
}

// module.exports = { CreateContentMessage, QueryMessages, UpdateContentMessage, SyncConversations };
export { CreateContentMessage, QueryMessages, UpdateContentMessage, SyncConversations }
