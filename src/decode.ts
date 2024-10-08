const protobuf = require('protobufjs');
const generateProto = require('./generate');

function select(q, obj, dict) {
  if (!dict) dict = {
    // obj is QueryMessagesResponse
    'messages': '_1',

    // obj is an individual message (_1[n])
    'messageNumber': '_1[0]',
    'senderId': '_2[0]_1[0]',
    'convoId': '_3[0]_1[0]_1[0]_1[0]',
    'textContent': '_4[0]_4[0]_2[0]_1[0]',
    'slideupText': '_4[0]_4[0]_7_11_1',
    'snapType': '_4[0]_9[0]_1[0]',
    'seenByInfo': '_6[0]',
    'messageIdProbably': '_7[0]',
    'assetInfo': '_4[0]_5',
    'assetEncryptionInfo': '_4[0]_4[0]_3[0]_3',
    'timestamp': '_6[0]_1[0]',
    'savedFromUser': '_4[0]_4[0]_8[0]_7[0]_1[0]_1[0]',
    'snapWebMessage': '_4[0]_4[0]_8[0]_17[0]', // this is a guess. might not be what this means.
    'deleteType': '_4[0]_4[0]_8[0]_5[0]_2',
    'repliedTo': '_6[0]_12[0]_1[0]',
    'reactions': '_6[0]_14',
    // obj is assetInfo
    'assetId': '_1[0]_3[0]_2[0]_2[0]',
    // obj is assetEncryptionInfo
    'encryptionKey': '_5[0]_1[0]_1[0]_19[0]_1[0]', // _4[0]._4[0]._3[0]._3[0]._5[0]._1[0]._1[0]._4[0]._1[0] // same thing but base64 encoded again?
    'encryptionIV': '_5[0]_1[0]_1[0]_19[0]_2[0]', // _4[0]._4[0]._3[0]._3[0]._5[0]._1[0]._1[0]._4[0]._2[0] // same thing but base64 encoded again?    
    // obj is seenByInfo
    'seenByUsers': '_4',
  };

  try {
    let varName = dict[q];
    let keys = varName.split('_').slice(1);
    for (let key of keys) {
      let m = key.match(/(\d+)\[?(\d*)\]?/);
      let [k, i] = m.slice(1);
      obj = obj[`_${k}`];
      if (i) obj = obj[parseInt(i)];
    }
    // return obj || null;
    return obj;
  } catch (e) {
    return null;
  }
}

async function SyncConversations(arrayBuffer, x=0) {
// async function SyncConversations(arrayBuffer) {
  // console.log([...new Uint8Array(arrayBuffer)].map(x => x.toString(16).padStart(2, '0')).join(' '));
  // let buffer = Buffer.from(new Uint8Array(arrayBuffer).slice(0, -30)); // slice removes grpc stuff at the end
  let buffer = Buffer.from(new Uint8Array(arrayBuffer).slice(0, -30 - x)); // slice removes grpc stuff at the end
  if (x > 100) return null;
  // console.log(x);

  // buffer = [...buffer].map(x => x.toString(16).padStart(2, '0')).join(' ');
  // buffer = buffer.replace(/00 00 00 .{2} .{2}/g, '');
  // buffer = Buffer.from(new Uint8Array(buffer.split(' ').map(x => parseInt(x, 16))));
  let sliceIdx = buffer[0] == 0 ? 5 : 0; // cleaner way to do this?
  buffer = buffer.slice(sliceIdx); // remove content length prefix

  // TODO: fix this
  // can't parse last bit (idx 2, 4, 6, 0, 0)
  // reproducible with: 0a ae 01 0a 17 0a 12 0a 10 f8 e1 8e 35 46 9d 56 71 98 3d bc 31 bc e1 23 da 10 ed 10 12 15 0a 13 12 11 0a 07 08 d9 0b 10 ad 95 3d 12 06 08 29 10 ad 95 3d 18 9f c8 96 e3 ee 30 32 47 10 9f c8 96 e3 ee 30 1a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 1a 12 0a 10 6b dc 9a 0b 8b 5b 43 e8 af 59 67 b8 5c b7 03 31 22 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 5a 02 08 01 3a 12 0a 10 6b dc 9a 0b 8b 5b 43 e8 af 59 67 b8 5c b7 03 31 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 52 02 08 02 5a 00 0a 68 0a 16 0a 12 0a 10 55 c3 34 64 42 ee 5c ac a7 dc ff bc b0 1a 83 07 10 04 12 10 0a 0e 12 0c 0a 04 10 c4 84 3d 12 04 10 c4 84 3d 18 ef e8 bb c9 d2 2e 32 07 10 ef e8 bb c9 d2 2e 3a 12 0a 10 43 b7 b4 a7 86 7a 45 bf a0 a5 a0 74 61 69 d4 a6 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 52 02 08 02 5a 00 0a 98 01 0a 16 0a 12 0a 10 50 d9 6c bf 16 33 54 62 85 26 8e 4a 10 ac 1a eb 10 08 12 14 0a 12 12 10 0a 06 08 05 10 c8 84 3d 12 06 08 03 10 c8 84 3d 18 a2 ae dc b8 94 2e 32 33 10 a2 ae dc b8 94 2e 1a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 22 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 5a 02 08 01 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 3a 12 0a 10 ef ce 4c 48 ff 52 42 6f b0 93 19 88 e4 1b 18 18 52 02 08 02 5a 00 0a 98 01 0a 16 0a 12 0a 10 c4 4b 4b 64 c8 fc 59 fa b2 cb 1b 83 ce 5f 71 ca 10 04 12 14 0a 12 12 10 0a 06 08 04 10 c4 84 3d 12 06 08 04 10 c4 84 3d 18 d1 d0 a8 cc 90 2e 32 33 10 d1 d0 a8 cc 90 2e 1a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 22 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 5a 02 08 01 3a 12 0a 10 69 69 69 69 b0 92 46 8f 8b 0a d4 a3 86 e9 b9 04 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 52 02 08 02 5a 00 0a 98 01 0a 16 0a 12 0a 10 da 6c 39 4a 6b 4b 55 f0 ba 7b 7f 2c bf 12 d2 94 10 04 12 14 0a 12 12 10 0a 06 08 01 10 c4 84 3d 12 06 08 01 10 c4 84 3d 18 94 c5 82 89 8c 2e 32 33 10 94 c5 82 89 8c 2e 1a 12 0a 10 45 a8 0d a2 29 e3 4f 61 8e 71 e6 fd d4 b3 17 a0 22 12 0a 10 45 a8 0d a2 29 e3 4f 61 8e 71 e6 fd d4 b3 17 a0 5a 02 08 01 3a 12 0a 10 45 a8 0d a2 29 e3 4f 61 8e 71 e6 fd d4 b3 17 a0 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 52 02 08 02 5a 00 0a 98 01 0a 16 0a 12 0a 10 a1 5d 03 29 4f 7c 59 d3 aa 7d ab 2b b9 9e b0 af 10 04 12 14 0a 12 12 10 0a 06 08 02 10 c4 84 3d 12 06 08 01 10 c4 84 3d 18 86 c7 e8 88 8c 2e 32 33 10 86 c7 e8 88 8c 2e 1a 12 0a 10 52 96 06 9a a9 f1 43 4e 8f 43 03 e1 39 47 13 47 22 12 0a 10 52 96 06 9a a9 f1 43 4e 8f 43 03 e1 39 47 13 47 5a 02 08 01 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 3a 12 0a 10 52 96 06 9a a9 f1 43 4e 8f 43 03 e1 39 47 13 47 52 02 08 02 5a 00 0a 98 01 0a 16 0a 12 0a 10 64 8f c2 9c ee 0e 5d 34 aa da ec a5 f1 c1 bc 0a 10 0a 12 14 0a 12 12 10 0a 06 08 08 10 c9 84 3d 12 06 08 07 10 c9 84 3d 18 e8 97 e2 88 8c 2e 32 33 10 eb 9c f1 8c 8c 2e 1a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 22 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 5a 02 08 01 3a 12 0a 10 ff b2 83 8e 4b 8b 4f 0e a5 13 b9 97 80 56 09 ef 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 52 02 08 02 5a 00 0a 6a 0a 16 0a 12 0a 10 31 fc 25 80 3e 7f 5c 2c 86 b6 55 65 ca 36 bc 8c 10 05 12 12 0a 10 12 0e 0a 06 08 01 10 c4 84 3d 12 04 10 c4 84 3d 18 c1 a2 e0 88 8c 2e 32 07 10 c1 a2 e0 88 8c 2e 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 3a 12 0a 10 b3 6e 05 09 dd 98 48 fb ad 20 b8 2f 18 4f bc 5f 52 02 08 02 5a 00 0a 96 01 0a 16 0a 12 0a 10 21 4a c8 a4 95 33 50 c8 8e 00 e9 ba 73 bd a2 6e 10 07 12 12 0a 10 12 0e 0a 06 08 01 10 c7 84 3d 12 04 10 c7 84 3d 18 c0 b4 ce 88 8c 2e 32 33 10 c0 b4 ce 88 8c 2e 1a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 22 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 5a 02 08 01 3a 12 0a 10 cd 81 1b 91 34 5b 49 64 90 ab 69 89 91 aa fb 3d 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 52 02 08 02 5a 00 0a 96 01 0a 16 0a 12 0a 10 8a 29 4f 22 7f 08 5c dd 9e 1e 77 c4 4e 5b 65 23 10 04 12 12 0a 10 12 0e 0a 06 08 01 10 c3 84 3d 12 04 10 c3 84 3d 18 8b cb ca 88 8c 2e 32 33 10 f7 f6 a3 ac 8d 2e 1a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 22 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 5a 02 08 01 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 3a 12 0a 10 c1 53 83 85 58 ff 4f a6 a7 f7 5a 3c 78 9a 2b c7 52 02 08 02 5a 00 0a 96 01 0a 16 0a 12 0a 10 93 79 ac 9f 55 e5 58 30 90 48 9f 14 9f 75 af b4 10 07 12 12 0a 10 12 0e 0a 06 08 01 10 c4 84 3d 12 04 10 c4 84 3d 18 9d a5 ca 88 8c 2e 32 33 10 d5 84 a9 d1 9d 2f 1a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 22 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 5a 02 08 01 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 3a 12 0a 10 63 79 8c b5 ca 60 4f 6c 87 e9 fc c7 c3 e0 0b 77 52 02 08 02 5a 00 0a 68 0a 16 0a 12 0a 10 70 39 55 a6 d1 41 59 3d 96 e3 5e f7 e9 7a 5d 4f 10 04 12 10 0a 0e 12 0c 0a 04 10 c4 84 3d 12 04 10 c4 84 3d 18 bc ee b4 af 85 2e 32 07 10 bc ee b4 af 85 2e 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 3a 12 0a 10 57 23 21 2a 27 fc 42 14 af 05 f2 3c d1 31 0d 61 52 02 08 02 5a 00 0a 96 01 0a 16 0a 12 0a 10 5a 2f f2 0f 75 16 53 16 b8 49 9e d1 12 30 34 de 10 04 12 12 0a 10 12 0e 0a 04 10 c4 84 3d 12 06 08 01 10 c4 84 3d 18 94 aa f9 ea f2 2d 32 33 10 94 aa f9 ea f2 2d 1a 12 0a 10 ae 47 a0 53 d2 51 45 bd 99 d6 82 24 48 de 41 a2 22 12 0a 10 ae 47 a0 53 d2 51 45 bd 99 d6 82 24 48 de 41 a2 5a 02 08 01 3a 12 0a 10 ae 47 a0 53 d2 51 45 bd 99 d6 82 24 48 de 41 a2 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 52 02 08 02 5a 00 0a 68 0a 16 0a 12 0a 10 aa 13 d9 c4 fd d5 58 7b 94 e5 66 3c 62 c4 6b 3d 10 04 12 10 0a 0e 12 0c 0a 04 10 c4 84 3d 12 04 10 c4 84 3d 18 b2 aa e8 c0 ef 2d 32 07 10 b2 aa e8 c0 ef 2d 3a 12 0a 10 cb 2d 6f b1 55 20 44 61 b5 83 b7 a2 65 b7 6a 9b 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 52 02 08 02 5a 00 0a 68 0a 16 0a 12 0a 10 ea 5b 7b d4 64 46 5e f6 b4 41 f9 a3 0a 73 fa 3c 10 03 12 10 0a 0e 12 0c 0a 04 10 c3 84 3d 12 04 10 c3 84 3d 18 c1 b9 95 b4 ee 2d 32 07 10 c1 b9 95 b4 ee 2d 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 3a 12 0a 10 6f 15 30 8e 35 b0 4f 56 bc 84 62 6a 7c bd c8 8d 52 02 08 02 5a 00 0a 96 01 0a 16 0a 12 0a 10 66 be 2d 9b 31 98 5e a8 87 73 fc 01 dc df 49 f7 10 03 12 12 0a 10 12 0e 0a 04 10 c3 84 3d 12 06 08 01 10 c3 84 3d 18 87 c4 9a 95 ee 2d 32 33 10 87 c4 9a 95 ee 2d 1a 12 0a 10 7f 43 06 5b bc f0 4c 4f b4 97 1c b3 8b 9a 9d 86 22 12 0a 10 7f 43 06 5b bc f0 4c 4f b4 97 1c b3 8b 9a 9d 86 5a 02 08 01 3a 12 0a 10 7f 43 06 5b bc f0 4c 4f b4 97 1c b3 8b 9a 9d 86 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 52 02 08 02 5a 00 0a 68 0a 16 0a 12 0a 10 70 6b 39 ee ad 8c 5f 54 b9 d6 21 5d c3 42 24 41 10 04 12 10 0a 0e 12 0c 0a 04 10 c4 84 3d 12 04 10 c4 84 3d 18 a0 cd d1 f8 ed 2d 32 07 10 a0 cd d1 f8 ed 2d 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 3a 12 0a 10 78 2c 7f 9a 1d 02 4d b2 a4 8f fd 28 ed 3f b5 6a 52 02 08 02 5a 00 0a 68 0a 16 0a 12 0a 10 82 bb 05 89 ae 4b 53 59 b1 a1 11 f3 4e 01 0c b6 10 04 12 10 0a 0e 12 0c 0a 04 10 c4 84 3d 12 04 10 c4 84 3d 18 87 a6 a2 f6 ed 2d 32 07 10 87 a6 a2 f6 ed 2d 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 3a 12 0a 10 3d 45 5d be c7 ae 41 a3 b9 1c 61 9b 2b 9d eb 97 52 02 08 02 5a 00 0a 96 01 0a 16 0a 12 0a 10 d0 a5 b5 2a 40 21 59 84 a8 83 b3 38 eb 37 25 40 10 04 12 12 0a 10 12 0e 0a 04 10 c4 84 3d 12 06 08 01 10 c4 84 3d 18 f7 fa f9 f4 ed 2d 32 33 10 f7 fa f9 f4 ed 2d 1a 12 0a 10 dd df 09 79 e0 61 42 ea 8d c3 ba 5e 88 81 25 23 22 12 0a 10 dd df 09 79 e0 61 42 ea 8d c3 ba 5e 88 81 25 23 5a 02 08 01 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 3a 12 0a 10 dd df 09 79 e0 61 42 ea 8d c3 ba 5e 88 81 25 23 52 02 08 02 5a 00 0a 98 01 0a 16 0a 12 0a 10 82 d3 f2 66 d2 93 5d a3 9b f4 5a 6c 22 93 9f 34 10 04 12 14 0a 12 12 10 0a 06 08 01 10 c3 84 3d 12 06 08 01 10 c3 84 3d 18 f8 c0 a8 ef ed 2d 32 33 10 90 a5 ba a9 98 2e 1a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 22 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 5a 02 08 01 3a 12 0a 10 d6 3f e3 63 b4 38 4a 17 a8 dc 54 9b c1 4d a0 96 3a 12 0a 10 a0 47 73 14 5e 56 41 fe 9f 6e 27 41 b6 24 95 a0 52 02 08 02 5a 00 12 28 0a 07 10 9e a5 99 e3 ee 30 1a 1b 0a 12 0a 10 82 d3 f2 66 d2 93 5d a3 9b f4 5a 6c 22 93 9f 34 10 f8 c0 a8 ef ed 2d 20 01 20 c5 f3 99 e3 ee 30 32 1b 08 f8 c0 a8 ef ed 2d 12 12 0a 10 82 d3 f2 66 d2 93 5d a3 9b f4 5a 6c 22 93 9f 34 80 00 00 00 1e 67 72 70 63 2d 73 74 61 74 75 73 3a 30 0d 0a 67 72 70 63 2d 6d 65 73 73 61 67 65 3a 0d 0a
  // generateProto sometimes turns int64 into message A { message B { int64 _0 = 0; int64 _1 = 1; } } ? maybe int64 is the wrong data type
  try {
    let proto = await generateProto(buffer);
    proto = `package snap;\nsyntax = "proto3";\nmessage Schema ${proto.substr(proto.indexOf('{'))}`;

    let root = protobuf.parse(proto).root;
    const Schema = root.lookupType('snap.Schema');
    let json = Schema.decode(buffer).toJSON();
    // console.log(proto);
    // console.log([...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join(' '));
    // console.log('json begin');
    // console.log(JSON.stringify(json));
    // console.log('json end');
    return json;
  } catch (e) {
    return SyncConversations(arrayBuffer, x + 1);
  }
}

async function QueryMessages(arrayBuffer) {
  // console.log([...new Uint8Array(arrayBuffer)].map(x => x.toString(16).padStart(2, '0')).join(' '));

  let buffer = Buffer.from(new Uint8Array(arrayBuffer).slice(0, -30)); // slice removes grpc stuff at the end

  let sliceIdx = buffer[0] == 0 ? 5 : 0; // cleaner way to do this?
  buffer = buffer.slice(sliceIdx); // remove content length prefix
  let proto = await generateProto(buffer, true);
  proto = `package snap;\nsyntax = "proto3";\nmessage QueryMessagesResponse_Generated ${proto.substr(proto.indexOf('{'))}`;

proto = `
package snap;
syntax = "proto3";
message QueryMessagesResponse_Generated {
  repeated int64 _0 = 0;
  message Message {
    repeated int64 _1 = 1;
    message a4 {
      repeated bytes _1 = 1;
    }
    repeated a4 _2 = 2;

    message a6 {
      message a7 {
        message a8 {
          repeated bytes _1 = 1;
        }
        repeated a8 _1 = 1;

        repeated int64 _2 = 2;
      }
      repeated a7 _1 = 1;

      message ab {
        repeated bytes _1 = 1;
      }
      repeated ab _99 = 99;

    }
    repeated a6 _3 = 3;

    message ad {
      repeated int64 _2 = 2;
      message af {
        repeated bytes _1 = 1;
      }
      repeated af _3 = 3;

      message a11 {
        message a12 {
          repeated string _1 = 1;
          message a14 {
            message a15 {
              repeated int64 _2 = 2;
            }
            repeated a15 _1 = 1;

            message a17 {
              repeated bytes _2 = 2;
            }
            repeated a17 _4 = 4;

          }
          repeated a14 _2 = 2;

        }
        repeated a12 _2 = 2;

        message a19 {
          message a1a {
            message a1b {
              repeated bytes _2 = 2;
              message a1d {
                repeated bytes _1 = 1;
                message a1f {
                  repeated bytes _2 = 2;
                  repeated bytes _3 = 3;
                  repeated bytes _6 = 6;
                  repeated int64 _9 = 9;
                  repeated int64 _10 = 10;
                  repeated int64 _12 = 12;
                }
                repeated a1f _2 = 2;

              }
              repeated a1d _3 = 3;

              repeated int64 _8 = 8;
            }
            repeated a1b _4 = 4;

            message a27 {
              message a28 {
                message a29 {
                  repeated int64 _2 = 2;
                  message a2b {
                    repeated bytes _1 = 1;
                    repeated bytes _2 = 2;
                  }
                  repeated a2b _4 = 4;

                  message a2e {
                    repeated int64 _1 = 1;
                    repeated int64 _2 = 2;
                  }
                  repeated a2e _5 = 5;

                  repeated int64 _12 = 12;
                  repeated int64 _13 = 13;
                  repeated int64 _15 = 15;
                  repeated bytes _18 = 18;
                  message a35 {
                    repeated bytes _1 = 1;
                    repeated bytes _2 = 2;
                  }
                  repeated a35 _19 = 19;

                }
                repeated a29 _1 = 1;

              }
              repeated a28 _1 = 1;

              message a38 {
                repeated int64 _5 = 5;
                repeated bytes _6 = 6;
                repeated int64 _8 = 8;
              }
              repeated a38 _2 = 2;

            }
            repeated a27 _5 = 5;

            repeated bytes _11 = 11;
            repeated bytes _13 = 13;
            message a3e {
              repeated int64 _6 = 6;
            }
            repeated a3e _17 = 17;

            message a40 {
              repeated int64 _4 = 4;
            }
            repeated a40 _22 = 22;

            message a42 {
              repeated int64 _1 = 1;
              repeated int64 _2 = 2;
            }
            repeated a42 _28 = 28;

          }
          repeated a1a _3 = 3;

        }
        repeated a19 _3 = 3;

        message Slideup {
          message TextContent {
            optional string _1 = 1;
          }
          optional TextContent _11 = 11;
        }
        optional Slideup _7 = 7;

        message a45 {
          message DeleteInfo {
            message Message2 {
              optional string _1 = 1;
            }
            optional Message2 _1 = 1;
            optional int64 _2 = 2;
          }
          repeated DeleteInfo _5 = 5;

          message a46 {
            message a47 {
              repeated bytes _1 = 1;
            }
            repeated a47 _1 = 1;

            repeated int64 _2 = 2;
            message a4a {
              repeated int64 _1 = 1;
              repeated int64 _2 = 2;
            }
            repeated a4a _3 = 3;

          }
          repeated a46 _7 = 7;

          repeated string _17 = 17;

        }
        repeated a45 _8 = 8;

        message a4d {
          message a4e {
            repeated bytes _5 = 5;
          }
          repeated a4e _4 = 4;

          message a50 {
            message a51 {
              message a52 {
                repeated int64 _2 = 2;
                repeated int64 _3 = 3;
                message a55 {
                  repeated bytes _1 = 1;
                  repeated bytes _2 = 2;
                }
                repeated a55 _4 = 4;

                message a58 {
                  repeated int64 _1 = 1;
                  repeated int64 _2 = 2;
                }
                repeated a58 _5 = 5;

                repeated int64 _12 = 12;
                repeated int64 _13 = 13;
                repeated int64 _15 = 15;
                repeated bytes _18 = 18;
                message a5f {
                  repeated bytes _1 = 1;
                  repeated bytes _2 = 2;
                }
                repeated a5f _19 = 19;

              }
              repeated a52 _1 = 1;

            }
            repeated a51 _1 = 1;

            message a62 {
              repeated int64 _5 = 5;
              repeated bytes _6 = 6;
            }
            repeated a62 _2 = 2;

          }
          repeated a50 _5 = 5;

          message a65 {
            message a66 {
              message a67 {
                message a68 {
                  repeated bytes _12 = 12;
                }
                repeated a68 _2 = 2;

              }
              repeated a67 _1 = 1;

            }
            repeated a66 _4 = 4;

          }
          repeated a65 _13 = 13;

          message a6a {
            repeated int64 _5 = 5;
            repeated int64 _7 = 7;
          }
          repeated a6a _17 = 17;

        }
        repeated bytes _11 = 11;

      }
      repeated a11 _4 = 4;

      message a6d {
        message a6e {
          message a6f {
            repeated bytes _1 = 1;
            message a71 {
              repeated bytes _2 = 2;
              repeated bytes _3 = 3;
              repeated bytes _6 = 6;
              repeated int64 _9 = 9;
              repeated int64 _10 = 10;
              message a77 {
                repeated int64 _1 = 1;
              }
              repeated a77 _11 = 11;

              repeated int64 _12 = 12;
            }
            repeated a71 _2 = 2;

          }
          repeated a6f _3 = 3;

          repeated int64 _6 = 6;
          repeated int64 _8 = 8;
        }
        repeated a6e _1 = 1;

      }
      message assetInfo {
        message x {
          message xx {
            message xxx {
              repeated bytes _2 = 2;
            }
            repeated xxx _2 = 2;
          }
          repeated xx _3 = 3;
        }
        repeated x _1 = 1;
      }
      repeated assetInfo _5 = 5;

      repeated bytes _6 = 6;
      repeated int64 _7 = 7;
      message a7e {
        message a7f {
          message a80 {
            repeated int64 _1 = 1;
          }
          repeated a80 _1 = 1;

        }
        repeated a7f _1 = 1;

      }
      repeated a7e _8 = 8;

      message a82 {
        repeated bytes _1 = 1;
        message a84 {
          repeated bytes _5 = 5;
        }
        repeated a84 _2 = 2;

      }
      repeated a82 _9 = 9;

    }
    repeated ad _4 = 4;

    repeated int64 _5 = 5;
    message a87 {
      repeated int64 _1 = 1;
      repeated int64 _2 = 2;
      message a8a {
        repeated bytes _1 = 1;
      }
      repeated a8a _4 = 4;

      message a8c {
        repeated bytes _1 = 1;
      }
      repeated a8c _6 = 6;

      message a8e {
        repeated bytes _1 = 1;
      }
      repeated a8e _8 = 8;

      message a90 {
        repeated bytes _1 = 1;
      }
      repeated a90 _10 = 10;

      repeated int64 _11 = 11;
      message RespondedTo {
        repeated int64 _1 = 1;
      }
      repeated RespondedTo _12 = 12;

      message a95 {
        message a96 {
          repeated bytes _1 = 1;
        }
        repeated a96 _1 = 1;

        message a98 {
          repeated int64 _1 = 1;
        }
        repeated a98 _2 = 2;

        repeated int64 _3 = 3;
      }
      repeated a95 _14 = 14;

    }
    repeated a87 _6 = 6;

    repeated int64 _7 = 7;
    message a9c {
      message a9d {
        repeated bytes _1 = 1;
      }
      repeated a9d _1 = 1;

    }
    repeated a9c _9 = 9;

  }
  repeated Message _1 = 1;

}
  `

  // let root = await protobuf.load('snap.proto');
  let root = protobuf.parse(proto).root;

  const Schema = root.lookupType('snap.QueryMessagesResponse_Generated');

  Schema.decodeDelimitedPadding = buffer => {
    let sliceIdx = buffer[0] == 0 ? 5 : 0;
    // console.log([...buffer.slice(sliceIdx)].map(x => x.toString(16).padStart(2, '0')).join(' '));
    return Schema.decode(buffer.slice(sliceIdx));
  }

  Schema.encodeDelimitedPadding = message => {
    const parseHexString = str => str.replaceAll('-', '').replaceAll(' ', '').match(/.{2}/g).map(x => parseInt(x, 16));
    let messageBuffer = Schema.encode(message).finish();
    let prefix = parseHexString(messageBuffer.length.toString(16).padStart(10, '0'));
    return Buffer.from([...prefix, ...messageBuffer]);
  }

  // let decoded = Schema.decodeDelimitedPadding(buffer)
  // let buf2 = Schema.encodeDelimitedPadding(decoded);
  // console.log([...buf2.slice(0)].map(x => x.toString(16).padStart(2, '0')).join(' '));
// console.log('trying-9768-1')
  // console.log(proto);
  // console.log([...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join(' '));
  let json = Schema.decodeDelimitedPadding(buffer).toJSON();
// console.log('done-9768-2')
  return json;
}

// QueryMessages(new Uint8Array([0,0,0,17,27,10,132,1,8,211,11,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,24,16,1,26,2,10,0,34,12,18,10,10,8,104,101,121,32,115,97,109,33,50,0,56,2,50,17,8,197,176,231,152,238,48,16,198,247,136,156,238,48,88,186,16,56,128,160,190,235,155,241,175,178,116,74,20,10,18,10,16,0,0,0,0,0,0,5,211,152,61,188,49,188,225,35,218,10,224,2,8,210,11,18,18,10,16,107,220,154,11,139,91,67,232,175,89,103,184,92,183,3,49,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,250,1,16,2,26,2,10,0,34,164,1,26,161,1,26,158,1,42,153,1,10,146,1,10,143,1,34,72,10,44,105,82,43,84,115,118,107,49,82,100,43,51,72,82,111,66,52,77,98,116,113,56,118,122,88,87,66,78,122,68,69,112,72,87,47,112,82,109,86,100,118,69,89,61,18,24,120,56,111,65,122,90,89,54,81,52,86,119,106,73,114,100,80,106,85,70,108,119,61,61,42,6,8,134,3,16,204,6,120,160,31,146,1,0,154,1,52,10,32,137,31,147,178,249,53,69,223,183,29,26,1,224,198,237,171,203,243,93,96,77,204,49,41,29,111,233,70,101,93,188,70,18,16,199,202,0,205,150,58,67,133,112,140,138,221,62,53,5,151,18,2,64,4,106,0,42,71,10,69,26,65,10,23,67,51,56,119,80,100,90,81,74,100,76,102,113,71,69,112,67,56,121,53,89,95,49,18,38,18,21,67,51,56,119,80,100,90,81,74,100,76,102,113,71,69,112,67,56,121,53,89,26,0,26,0,50,1,3,72,1,80,4,96,1,112,2,64,2,50,0,56,2,50,10,8,168,175,212,152,238,48,88,183,16,56,179,155,254,130,186,240,237,173,37,74,20,10,18,10,16,0,0,0,0,0,0,5,210,152,61,188,49,188,225,35,218,10,209,4,8,209,11,18,18,10,16,107,220,154,11,139,91,67,232,175,89,103,184,92,183,3,49,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,228,3,16,2,26,2,10,0,34,197,2,26,194,2,26,158,1,42,153,1,10,146,1,10,143,1,34,72,10,44,122,98,48,69,116,87,69,99,83,49,74,112,114,74,68,112,48,98,106,54,67,43,79,108,102,53,87,52,115,88,119,116,114,104,119,87,82,82,78,77,66,49,99,61,18,24,90,56,50,79,119,70,110,106,115,78,87,80,87,110,79,111,117,84,105,118,112,65,61,61,42,6,8,134,3,16,204,6,120,160,31,146,1,0,154,1,52,10,32,205,189,4,181,97,28,75,82,105,172,144,233,209,184,250,11,227,165,127,149,184,177,124,45,174,28,22,69,19,76,7,87,18,16,103,205,142,192,89,227,176,213,143,90,115,168,185,56,175,164,18,2,64,4,106,0,26,158,1,42,153,1,10,146,1,10,143,1,34,72,10,44,111,107,73,88,108,101,79,86,121,72,74,83,56,86,53,109,47,102,43,85,121,110,43,69,98,113,68,53,86,121,82,104,75,104,117,54,115,82,83,87,116,120,73,61,18,24,122,105,113,85,114,78,53,49,56,106,87,116,104,112,70,80,82,114,100,68,65,119,61,61,42,6,8,134,3,16,204,6,120,160,31,146,1,0,154,1,52,10,32,162,66,23,149,227,149,200,114,82,241,94,102,253,255,148,202,127,132,110,160,249,87,36,97,42,27,186,177,20,150,183,18,18,16,206,42,148,172,222,117,242,53,173,134,145,79,70,183,67,3,18,2,64,4,106,0,42,71,10,69,26,65,10,23,90,116,121,84,88,88,77,89,83,57,51,84,83,78,49,51,89,104,48,103,75,95,49,18,38,18,21,90,116,121,84,88,88,77,89,83,57,51,84,83,78,49,51,89,104,48,103,75,26,0,26,0,50,1,3,72,1,80,4,96,1,112,2,64,2,42,71,10,69,26,65,10,23,116,117,100,75,66,87,121,82,88,86,90,105,101,97,118,53,85,71,112,104,114,95,49,18,38,18,21,116,117,100,75,66,87,121,82,88,86,90,105,101,97,118,53,85,71,112,104,114,26,0,26,0,50,1,3,72,1,80,4,96,1,112,2,64,2,50,0,56,2,50,17,8,131,159,203,152,238,48,16,179,160,203,152,238,48,88,182,16,56,156,182,142,255,255,250,138,227,53,74,20,10,18,10,16,0,0,0,0,0,0,5,209,152,61,188,49,188,225,35,218,10,126,8,208,11,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,18,16,1,26,2,10,0,34,6,18,4,10,2,104,105,50,0,56,2,50,17,8,250,136,199,152,238,48,16,190,248,201,152,238,48,88,180,16,56,128,192,136,139,213,129,219,251,1,74,20,10,18,10,16,0,0,0,0,0,0,5,208,152,61,188,49,188,225,35,218,10,122,8,207,11,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,21,16,1,26,2,10,0,34,9,18,7,10,5,119,111,119,115,97,50,0,56,2,50,10,8,183,207,164,152,238,48,88,178,16,56,128,224,202,211,226,245,182,178,119,74,20,10,18,10,16,0,0,0,0,0,0,5,207,152,61,188,49,188,225,35,218,10,133,1,8,206,11,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,25,16,1,26,2,10,0,34,13,18,11,10,9,108,111,108,115,32,240,159,164,163,50,0,56,2,50,17,8,143,193,229,150,238,48,16,242,199,229,150,238,48,88,175,16,56,128,160,248,195,132,129,237,157,28,74,20,10,18,10,16,0,0,0,0,0,0,5,206,152,61,188,49,188,225,35,218,10,148,1,8,205,11,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,20,16,1,26,2,10,0,34,8,18,6,10,4,116,101,115,116,50,0,56,2,50,37,8,251,238,228,150,238,48,16,144,141,229,150,238,48,50,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,88,177,16,56,128,240,160,233,196,247,184,199,9,74,20,10,18,10,16,0,0,0,0,0,0,5,205,152,61,188,49,188,225,35,218,10,118,8,204,11,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,17,16,1,26,2,10,0,34,5,18,3,10,1,98,50,0,56,2,50,10,8,204,215,227,150,238,48,88,171,16,56,128,224,189,143,168,150,217,200,17,74,20,10,18,10,16,0,0,0,0,0,0,5,204,152,61,188,49,188,225,35,218,10,118,8,203,11,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,17,16,1,26,2,10,0,34,5,18,3,10,1,97,50,0,56,2,50,10,8,142,215,227,150,238,48,88,170,16,56,128,144,187,142,184,152,206,156,70,74,20,10,18,10,16,0,0,0,0,0,0,5,203,152,61,188,49,188,225,35,218,10,139,1,8,183,11,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,17,16,1,26,2,10,0,34,5,18,3,10,1,97,50,0,56,2,50,30,8,139,144,216,188,237,48,50,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,88,248,15,56,132,241,234,163,233,181,144,137,191,1,74,20,10,18,10,16,0,0,0,0,0,0,5,183,152,61,188,49,188,225,35,218,10,146,1,8,165,11,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,18,16,1,26,2,10,0,34,6,18,4,10,2,104,105,50,0,56,2,50,37,8,242,203,128,168,237,48,16,210,211,128,168,237,48,50,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,88,199,15,56,128,176,167,248,223,155,188,187,55,74,20,10,18,10,16,0,0,0,0,0,0,5,165,152,61,188,49,188,225,35,218,10,148,1,8,162,11,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,20,16,1,26,2,10,0,34,8,18,6,10,4,108,111,108,122,50,0,56,2,50,37,8,211,244,232,167,237,48,16,143,252,232,167,237,48,50,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,88,205,15,56,128,224,134,154,199,169,128,227,29,74,20,10,18,10,16,0,0,0,0,0,0,5,162,152,61,188,49,188,225,35,218,10,138,1,8,137,11,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,17,16,1,26,2,10,0,34,5,18,3,10,1,97,50,0,56,2,50,30,8,171,188,220,166,237,48,50,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,88,149,15,56,128,215,173,196,140,162,209,181,104,74,20,10,18,10,16,0,0,0,0,0,0,5,137,152,61,188,49,188,225,35,218,10,186,3,8,252,10,18,18,10,16,107,220,154,11,139,91,67,232,175,89,103,184,92,183,3,49,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,184,2,16,2,26,2,10,0,34,164,1,26,161,1,26,158,1,42,153,1,10,146,1,10,143,1,34,72,10,44,110,110,84,86,50,57,120,54,87,103,68,74,52,110,49,112,73,121,109,86,68,111,53,47,73,57,47,101,74,104,99,98,108,71,51,109,69,43,104,71,47,69,48,61,18,24,67,98,88,117,72,107,89,74,84,117,119,115,50,77,109,82,90,51,49,67,100,103,61,61,42,6,8,134,3,16,239,1,120,160,31,146,1,0,154,1,52,10,32,158,116,213,219,220,122,90,0,201,226,125,105,35,41,149,14,142,127,35,223,222,38,23,27,148,109,230,19,232,70,252,77,18,16,9,181,238,30,70,9,78,236,44,216,201,145,103,125,66,118,18,2,64,4,106,0,42,125,10,42,26,38,18,36,18,21,118,65,119,118,79,76,112,98,89,81,48,85,88,50,99,103,65,101,75,48,53,26,0,26,0,50,1,3,72,2,80,4,96,1,64,2,10,79,26,73,10,28,85,112,74,110,121,51,99,73,112,98,77,114,50,114,81,97,122,84,101,52,54,46,49,48,50,48,95,49,18,41,18,26,85,112,74,110,121,51,99,73,112,98,77,114,50,114,81,97,122,84,101,52,54,46,49,48,50,48,26,0,26,0,50,1,4,72,1,80,30,96,1,48,2,64,2,50,0,56,2,66,6,10,4,10,2,8,2,50,37,8,198,217,128,158,237,48,16,226,218,128,158,237,48,50,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,88,131,15,56,222,222,239,206,207,214,226,198,131,1,74,20,10,18,10,16,0,0,0,0,0,0,5,124,152,61,188,49,188,225,35,218,10,182,2,8,251,10,18,18,10,16,107,220,154,11,139,91,67,232,175,89,103,184,92,183,3,49,26,30,154,6,2,34,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,169,1,26,54,34,52,10,32,119,18,8,111,237,93,254,171,56,208,73,230,251,205,236,39,208,112,53,138,177,235,184,172,52,217,169,116,186,175,151,159,18,16,186,27,193,174,154,206,42,239,113,112,82,124,115,246,188,206,34,57,90,55,34,2,42,0,42,22,10,16,10,14,120,144,78,146,1,0,42,6,8,134,3,16,204,6,18,2,50,0,106,8,34,6,10,4,18,2,98,0,138,1,14,40,230,252,255,157,237,48,56,144,133,128,158,237,48,42,44,10,42,26,38,18,36,18,21,54,115,103,117,115,107,67,51,110,65,65,100,89,49,56,86,67,69,118,97,53,26,0,26,0,50,1,3,72,2,80,4,96,1,64,2,50,0,56,3,74,2,10,0,40,2,50,57,8,223,134,128,158,237,48,16,134,249,131,158,237,48,34,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,50,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,88,128,15,56,143,197,141,135,240,196,172,207,7,74,10,16,232,150,187,162,193,178,232,154,108,10,255,1,8,250,8,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,126,16,1,26,2,10,0,34,114,18,112,10,110,116,111,111,107,32,109,101,32,115,111,109,101,32,116,105,109,101,32,116,111,32,102,105,103,117,114,101,32,111,117,116,32,116,104,101,32,112,114,111,116,111,99,111,108,44,32,98,117,116,32,110,111,119,32,116,104,97,116,32,105,32,117,110,100,101,114,115,116,97,110,100,32,105,116,32,115,104,111,117,108,100,32,98,101,32,112,111,115,115,105,98,108,101,32,116,111,32,114,101,99,114,101,97,116,101,32,116,104,101,33,50,0,56,2,50,37,8,159,202,194,152,237,48,16,207,208,194,152,237,48,50,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,88,186,11,56,129,178,239,180,231,216,249,159,249,1,74,20,10,18,10,16,0,0,0,0,0,0,4,122,152,61,188,49,188,225,35,218,10,157,1,8,140,7,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,35,16,1,26,2,10,0,34,23,18,21,10,19,66,114,121,115,111,110,32,115,109,101,108,108,115,32,76,79,76,33,33,50,0,56,2,50,30,8,241,197,134,230,236,48,50,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,88,194,9,56,180,188,152,152,168,191,166,221,250,1,74,20,10,18,10,16,0,0,0,0,0,0,3,140,152,61,188,49,188,225,35,218,10,157,1,8,199,2,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,35,16,1,26,2,10,0,34,23,18,21,10,19,66,114,121,115,111,110,32,115,109,101,108,108,115,32,76,79,76,33,33,50,0,56,2,50,30,8,228,130,131,210,236,48,50,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,88,193,9,56,207,150,228,212,167,240,148,215,162,1,74,20,10,18,10,16,0,0,0,0,0,0,1,71,152,61,188,49,188,225,35,218,10,148,1,8,199,1,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,20,16,1,26,2,10,0,34,8,18,6,10,4,116,101,115,116,50,0,56,2,50,37,8,178,165,229,168,236,48,16,229,253,154,169,236,48,50,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,88,175,2,56,212,242,205,219,143,193,215,252,65,74,20,10,18,10,16,0,0,0,0,0,0,0,199,152,61,188,49,188,225,35,218,10,149,1,8,86,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,22,16,1,26,2,10,0,34,10,18,8,10,6,110,111,116,32,104,105,50,0,56,2,50,36,8,134,213,167,136,236,48,16,209,156,168,136,236,48,50,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,88,124,56,166,197,193,237,178,130,131,186,241,1,74,20,10,18,10,16,0,0,0,0,0,0,0,86,152,61,188,49,188,225,35,218,10,138,1,8,2,18,18,10,16,107,220,154,11,139,91,67,232,175,89,103,184,92,183,3,49,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,19,16,1,26,2,10,0,34,7,18,5,10,3,112,108,115,50,0,56,2,50,29,8,175,219,234,136,140,46,50,18,10,16,107,220,154,11,139,91,67,232,175,89,103,184,92,183,3,49,88,3,56,177,214,142,207,201,174,243,136,125,74,20,10,18,10,16,146,96,39,176,176,226,76,239,142,128,105,130,245,37,118,158,10,146,1,8,1,18,18,10,16,160,71,115,20,94,86,65,254,159,110,39,65,182,36,149,160,26,30,154,6,2,10,0,10,23,10,18,10,16,248,225,142,53,70,157,86,113,152,61,188,49,188,225,35,218,16,186,16,34,19,16,1,26,2,10,0,34,7,18,5,10,3,115,101,120,50,0,56,2,50,36,8,252,230,197,136,140,46,16,169,189,161,137,140,46,50,18,10,16,107,220,154,11,139,91,67,232,175,89,103,184,92,183,3,49,88,3,56,159,240,162,217,148,153,241,140,167,1,74,20,10,18,10,16,48,130,231,35,74,158,74,244,162,198,25,187,40,107,172,191,16,1,128,0,0,0,30,103,114,112,99,45,115,116,97,116,117,115,58,48,13,10,103,114,112,99,45,109,101,115,115,97,103,101,58,13,10]));

// module.exports = { select, QueryMessages, SyncConversations };
export { select, QueryMessages, SyncConversations }
