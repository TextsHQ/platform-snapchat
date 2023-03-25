const { decodeProto } = require('./protobufDecoder');

function fullyDecode(arr) {
    let decoded  = decodeProto(arr);
    return {...decoded, parts: decoded.parts.map(x => {
        let next = fullyDecode(x.value);
        if (next.leftOver.length > 0 || next.parts.length == 0) return x;
        delete next.leftOver; // not necessary
        return {contents: next, index: x.index};
    })};
	}
  function clean(obj) {
      if (!obj.parts) return obj;
      obj = obj.parts;
      obj = obj.map(x => clean(x))
      return obj;
  }

  function deepMergeObjects(...objects) {
    const merged = {};

    function merge(target, source) {
      Object.keys(source).forEach(key => {
        const sourceValue = source[key];

        if (Array.isArray(sourceValue)) {
          target[key] = Array.isArray(target[key]) ? target[key] : [];
          target[key] = target[key].concat(sourceValue);
        } else if (isObject(sourceValue)) {
          target[key] = isObject(target[key]) ? target[key] : {};
          target[key] = deepMergeObjects(target[key], sourceValue);
        } else {
          target[key] = sourceValue;
        }
      });
    }

    objects.forEach(obj => {
      merge(merged, obj);
    });

    return merged;
  }

  function isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  // TODO detect repeated
  function parse(obj) {
    const schema = {};
    obj.forEach(item => {
      if (item.index in schema) {
          if (item.type !== undefined) return;
          // if (schema[item.index] !== undefined) schema[item.index].repeat = true;
          schema[item.index] = deepMergeObjects(schema[item.index], parse(item.contents.parts));
      } else {
          if (item.type !== undefined) {
              schema[item.index] = {type: item.type};
          } else {
              schema[item.index] = parse(item.contents.parts);
          }
      }
    });
    return schema;
  }

  let n;
  // function format(obj, index=-1, repeat=false, depth=0, path="") {
  function format(obj, testfix=false, index=-1, depth=0, path='') {
  	if (depth == 0) n = 0;
    const id = () => 'a' + (n++).toString(16);
    let messageName = id();
    // obj.contents.parts = obj.contents.parts.sort((a, b) => a.index - b.index);
    // if (depth == 0) console.log(obj.contents.parts.map(x => x.index));
    let str = '\t'.repeat(depth) + `message ${messageName} {\n` + Object.keys(obj).map(k => {
      // if (k == 'repeat') return;
      let v = obj[k];
      // if (v.type === undefined) return format(v, k, obj.repeat, depth + 1);
      if (v.type === undefined) return format(v, testfix, parseInt(k), depth + 1, `${path}_${k}`);
      // if (![0, 2, 1, 5].includes(v.type)) console.log(v.type);
      // else console.log(v.type, 'good')
      let type = 'int64';
      if (v.type == 2) {
        type = 'bytes';
        if (`${path}_${k}` == '_1_4_4_2_1') type = 'string';
      } else if (v.type == 1) {
        type = 'fixed64';
      } else if (v.type == 5) {
        type = 'fixed32';
      }
      // if (testfix) console.log(`${path}_${k}`)
      // if (testfix && `${path}_${k}` == '_1_3_4_4') type = 'google.protobuf.Any';
      // type = 'google.protobuf.Any'; ///////////////
      let varName = id();
      // return '\t'.repeat(depth + 1) + `(${path}_${k}) repeated ${type} ${varName} = ${k};`;
      // return '\t'.repeat(depth + 1) + `repeated ${type} ${path}_${k} = ${k};`;
      return '\t'.repeat(depth + 1) + `repeated ${type} _${k} = ${k};`;
    }).join('\n') + `\n${'\t'.repeat(depth)}}\n${'\t'.repeat(depth)}`;
    // return depth == 0 ? str : str + `${obj.repeat ? 'repeated' : 'optional'} ${messageName} ${id()} = ${index};\n`;
      // return depth == 0 ? str : str + `(${path}) repeated ${messageName} ${id()} = ${index};\n`;

    // testfix for QueryMessage
    if (testfix && path == '_1_4_4_9') messageName = 'bytes'; // for now
    if (testfix && path == '_1_4_4_11') messageName = 'bytes'; // for now

    // reaction data, i think
    if (testfix && path == '_1_4_5') messageName = 'bytes'; // for now

    return depth == 0 ? str : str + `repeated ${messageName} _${index} = ${index};\n`;
  }

function generateProto(hexBuffer, testfix=false) {
	let decoding = clean(fullyDecode(hexBuffer));
	return format(parse(decoding), testfix);
}

module.exports = generateProto;
// export generateProto