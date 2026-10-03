'use strict'

const { describe, it } = require('node:test')

const assert = require('assert')
const yaml = require('js-yaml')

// Reads the scalar token written before the first top-level ":" as a standalone
// YAML document, so that the YAML 1.2 core type of a mapping key can be checked.
function reloadKey (dump) {
  return yaml.load(dump.split(':')[0].trim())
}

describe('Dumper Map support', function () {
  it('dumps an empty Map as an empty mapping', function () {
    assert.strictEqual(yaml.dump(new Map()), '{}\n')
    assert.deepStrictEqual(yaml.load(yaml.dump(new Map())), {})
  })

  it('dumps a string-keyed Map exactly like the equivalent plain object', function () {
    const map = new Map([['b', 1], ['a', { c: 2, d: [3, 4] }], ['e', 'yes']])
    const object = { b: 1, a: { c: 2, d: [3, 4] }, e: 'yes' }

    for (const options of [
      {},
      { sortKeys: true },
      { flowLevel: 0 },
      { flowLevel: 1 },
      { indent: 4 },
      { lineWidth: -1 }
    ]) {
      const mapDump = yaml.dump(map, options)
      assert.strictEqual(mapDump, yaml.dump(object, options))
      assert.deepStrictEqual(yaml.load(mapDump), object)
    }
  })

  it('quotes string keys that look like other core-schema scalars', function () {
    const pairs = [
      ['1', "'1': v\n"],
      ['true', "'true': v\n"],
      ['false', "'false': v\n"],
      ['null', "'null': v\n"],
      ['~', "'~': v\n"],
      ['1.5', "'1.5': v\n"],
      ['yes', "'yes': v\n"]
    ]

    for (const [key, expected] of pairs) {
      assert.strictEqual(yaml.dump(new Map([[key, 'v']])), expected)
      assert.strictEqual(reloadKey(yaml.dump(new Map([[key, 'v']]))), key)
    }
  })

  it('writes number/boolean/null keys as core-schema scalars', function () {
    const cases = [
      [1, '1: v\n', 1],
      [-3, '-3: v\n', -3],
      [1.5, '1.5: v\n', 1.5],
      [0, '0: v\n', 0],
      [1e21, '1e+21: v\n', 1e21],
      [true, 'true: v\n', true],
      [false, 'false: v\n', false],
      [null, 'null: v\n', null],
      [Infinity, '.inf: v\n', Infinity],
      [-Infinity, '-.inf: v\n', -Infinity]
    ]

    for (const [key, expected, reparsed] of cases) {
      const dump = yaml.dump(new Map([[key, 'v']]))
      assert.strictEqual(dump, expected)
      assert.strictEqual(reloadKey(dump), reparsed)
    }

    const dumpNaN = yaml.dump(new Map([[NaN, 'v']]))
    assert.strictEqual(dumpNaN, '.nan: v\n')
    assert.ok(Number.isNaN(reloadKey(dumpNaN)))
  })

  it('keeps number key 1 and string key "1" distinguishable in the text', function () {
    assert.strictEqual(yaml.dump(new Map([[1, 'a']])), '1: a\n')
    assert.strictEqual(yaml.dump(new Map([['1', 'a']])), "'1': a\n")

    // The document containing both is legal YAML 1.2 text; the loader rejects
    // it only because both keys collapse to the same string on construction.
    const dump = yaml.dump(new Map([[1, 'a'], ['1', 'b']]))
    assert.strictEqual(dump, "1: a\n'1': b\n")
    assert.throws(() => yaml.load(dump), /duplicated mapping key/)
  })

  it('dumps object and array keys as explicit complex keys in block style', function () {
    const objectKey = new Map([[{ a: 1 }, 'obj'], [['x', 2], 'arr']])

    assert.strictEqual(yaml.dump(objectKey), '?\n  a: 1\n: obj\n?\n  - x\n  - 2\n: arr\n')
    assert.deepStrictEqual(yaml.load(yaml.dump(objectKey)), {
      '[object Object]': 'obj',
      'x,2': 'arr'
    })
  })

  it('dumps nested complex keys with correctly indented contents', function () {
    const map = new Map([[{ nested: { a: [1, 2, 3] }, z: 1 }, 'v']])
    const expected = '?\n  nested:\n    a:\n      - 1\n      - 2\n      - 3\n  z: 1\n: v\n'
    assert.strictEqual(yaml.dump(map), expected)
    assert.deepStrictEqual(yaml.load(expected), { '[object Object]': 'v' })
  })

  it('dumps a Map used as a key', function () {
    const map = new Map([[new Map([['k', 'v']]), 'val'], ['s', 1]])
    assert.strictEqual(yaml.dump(map), '?\n  k: v\n: val\ns: 1\n')
    assert.deepStrictEqual(yaml.load(yaml.dump(map)), { '[object Object]': 'val', s: 1 })
  })

  it('dumps complex keys in flow style', function () {
    const map = new Map([[{ a: 1 }, 'obj'], [1, 'n']])
    assert.strictEqual(yaml.dump(map, { flowLevel: 0 }), "{? {a: 1}: obj, 1: 'n'}\n")
    assert.deepStrictEqual(yaml.load(yaml.dump(map, { flowLevel: 0 })), {
      '[object Object]': 'obj',
      1: 'n'
    })
  })

  it('supports Maps nested in Maps, arrays and objects', function () {
    const data = {
      m: new Map([['x', new Map([['y', 1]])]]),
      list: [new Map([['a', 1]])]
    }
    const expected = "m:\n  x:\n    'y': 1\nlist:\n  - a: 1\n"

    assert.strictEqual(yaml.dump(data), expected)
    assert.deepStrictEqual(yaml.load(expected), {
      m: { x: { y: 1 } },
      list: [{ a: 1 }]
    })
  })

  it('sorts Map keys with sortKeys: true', function () {
    const map = new Map([['c', 1], ['a', 2], ['b', 3]])
    assert.strictEqual(yaml.dump(map, { sortKeys: true }), 'a: 2\nb: 3\nc: 1\n')
  })

  it('sorts Map keys with a sortKeys function that sees the actual keys', function () {
    const map = new Map([[10, 'a'], [2, 'b'], [1, 'c']])
    const seen = []
    const dump = yaml.dump(map, {
      sortKeys: function (a, b) {
        seen.push([a, b])
        return a - b
      }
    })

    assert.strictEqual(dump, '1: c\n2: b\n10: a\n')
    assert.ok(seen.every(([a, b]) => typeof a === 'number' && typeof b === 'number'))
    assert.deepStrictEqual(yaml.load(dump), { 1: 'c', 2: 'b', 10: 'a' })
  })

  it('passes the real Map key and value to the replacer', function () {
    const map = new Map([['a', 1], [2, 'two']])
    const calls = []

    const dump = yaml.dump(map, {
      replacer: function (key, value) {
        calls.push([key, value])
        if (key === 2) return undefined // removes the entry
        return value
      }
    })

    assert.strictEqual(dump, 'a: 1\n')
    assert.ok(calls.some(([key, value]) => key === 2 && value === 'two'))
    assert.deepStrictEqual(yaml.load(dump), { a: 1 })
  })

  it('binds the replacer thisArg to the Map', function () {
    const map = new Map([['a', 1]])
    let thisSeen = null

    yaml.dump(map, {
      replacer: function (key, value) {
        if (key === 'a') thisSeen = this
        return value
      }
    })

    assert.strictEqual(thisSeen, map)
  })

  it('applies flowLevel at the Map level', function () {
    const map = new Map([['a', new Map([['x', 1]])], ['b', 2]])

    assert.strictEqual(yaml.dump(map, { flowLevel: 0 }), '{a: {x: 1}, b: 2}\n')
    assert.strictEqual(yaml.dump(map, { flowLevel: 1 }), 'a: {x: 1}\nb: 2\n')
    assert.deepStrictEqual(yaml.load(yaml.dump(map, { flowLevel: 0 })), {
      a: { x: 1 }, b: 2
    })
  })

  it('skips invalid values and keys with skipInvalid', function () {
    const map = new Map([
      ['ok', 1],
      ['bad', function () {}],
      ['nested', new Map([['x', function () {}], ['y', 2]])]
    ])

    assert.throws(() => yaml.dump(map), /unacceptable kind of an object to dump/)
    assert.strictEqual(yaml.dump(map, { skipInvalid: true }), "ok: 1\nnested:\n  'y': 2\n")
    assert.deepStrictEqual(yaml.load(yaml.dump(map, { skipInvalid: true })), {
      ok: 1,
      nested: { y: 2 }
    })
  })

  it('uses anchors and aliases for a Map referenced twice', function () {
    const inner = new Map([['x', 1]])
    const root = { a: inner, b: inner }

    const dump = yaml.dump(root)
    assert.strictEqual(dump, 'a: &ref_0\n  x: 1\nb: *ref_0\n')

    const reparsed = yaml.load(dump)
    assert.strictEqual(reparsed.a, reparsed.b)
  })

  it('expands a twice-referenced Map when noRefs is set', function () {
    const inner = new Map([['x', 1]])
    const root = { a: inner, b: inner }

    const dump = yaml.dump(root, { noRefs: true })
    assert.strictEqual(dump, 'a:\n  x: 1\nb:\n  x: 1\n')

    const reparsed = yaml.load(dump)
    assert.notStrictEqual(reparsed.a, reparsed.b)
  })

  it('dumps a self-referential Map', function () {
    const map = new Map()
    map.set('self', map)
    map.set('a', 1)

    const dump = yaml.dump(map)
    assert.strictEqual(dump, '&ref_0\nself: *ref_0\na: 1\n')

    const reparsed = yaml.load(dump)
    assert.strictEqual(reparsed.self, reparsed)
  })

  it('still refuses to dump a Set', function () {
    assert.throws(() => yaml.dump(new Set([1])), /unacceptable kind of an object to dump \[object Set\]/)
  })

  it('does not change output for plain objects and arrays', function () {
    const samples = [
      { a: 1, b: 'two', c: [1, 2, { d: 3 }], e: null, f: true },
      [],
      {},
      [1, 'x', null, false, { y: [2, 3] }],
      { 1: 'numkey', nested: { z: [{}] } }
    ]

    for (const sample of samples) {
      assert.doesNotThrow(() => yaml.load(yaml.dump(sample)))
      assert.deepStrictEqual(yaml.load(yaml.dump(sample)), sample)
    }
  })
})
