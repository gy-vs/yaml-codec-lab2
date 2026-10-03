'use strict'

const { describe, it } = require('node:test')

const assert = require('assert')
const yaml = require('js-yaml')

describe('dumper Map support', function () {
  it('dumps an empty Map as an empty mapping', function () {
    assert.strictEqual(yaml.dump(new Map()), '{}\n')
    assert.deepStrictEqual(yaml.load(yaml.dump(new Map())), {})
  })

  it('dumps a string-keyed Map exactly like the equivalent plain object', function () {
    const map = new Map([
      ['foo', 'bar'],
      ['list', [1, 2, 3]],
      ['nested', { a: true, b: null }],
      ['1', 'string-one'],
      ['yes', 'quoted'],
      ['', 'empty-key']
    ])
    // Plain objects enumerate integer-like keys first, so compare without it;
    // the number-vs-string-key case is covered separately.
    const object = {
      foo: 'bar',
      list: [1, 2, 3],
      nested: { a: true, b: null },
      yes: 'quoted',
      '': 'empty-key'
    }
    map.delete('1')

    assert.strictEqual(yaml.dump(map), yaml.dump(object))
    assert.deepStrictEqual(yaml.load(yaml.dump(map)), object)

    // and the integer-like string key is quoted exactly as on a plain object
    const stringOne = {}
    stringOne[1] = 'v'
    assert.strictEqual(
      yaml.dump(new Map([['1', 'v']])),
      yaml.dump(stringOne)
    )
  })

  it('preserves Map insertion order', function () {
    const map = new Map([['b', 1], ['a', 2], ['c', 3]])

    assert.strictEqual(yaml.dump(map), 'b: 1\na: 2\nc: 3\n')
  })

  it('writes number keys as numeric scalars, distinct from string keys', function () {
    assert.strictEqual(yaml.dump(new Map([[1, 'a']])), '1: a\n')
    assert.strictEqual(yaml.dump(new Map([['1', 'a']])), "'1': a\n")

    const types = [
      [1, 'int'],
      [-17, 'negative'],
      [1.5, 'float'],
      [255, 'hex-looking']
    ]

    for (const [key, label] of types) {
      const text = yaml.dump(new Map([[key, 'v']]))
      const loaded = yaml.load(text)
      assert.strictEqual(Object.keys(loaded)[0], String(key), label + ' key text')

      // a string key with the same spelling must be quoted, so the texts differ
      const textString = yaml.dump(new Map([[String(key), 'v']]))
      assert.notStrictEqual(text, textString, label + ' vs string key')
    }
  })

  it('writes boolean and null keys as typed scalars, distinct from string keys', function () {
    assert.strictEqual(yaml.dump(new Map([[true, 'a']])), 'true: a\n')
    assert.strictEqual(yaml.dump(new Map([['true', 'a']])), "'true': a\n")
    assert.strictEqual(yaml.dump(new Map([[false, 'a']])), 'false: a\n')
    assert.strictEqual(yaml.dump(new Map([[null, 'a']])), 'null: a\n')
    assert.strictEqual(yaml.dump(new Map([['null', 'a']])), "'null': a\n")

    for (const [key, spelling] of [[true, 'true'], [false, 'false'], [null, 'null']]) {
      assert.deepStrictEqual(yaml.load(yaml.dump(new Map([[key, 'v']]))), { [spelling]: 'v' })
    }
  })

  it('dumps arrays used as keys using complex key notation', function () {
    const map = new Map([[[1, 2], 'array'], [[3, 4], 'array2']])
    const text = yaml.dump(map)

    assert.strictEqual(text, '? - 1\n  - 2\n: array\n? - 3\n  - 4\n: array2\n')
    assert.deepStrictEqual(yaml.load(text), { '1,2': 'array', '3,4': 'array2' })
  })

  it('dumps plain objects used as keys using complex key notation', function () {
    const map = new Map([[{ x: 1 }, 'object']])
    const text = yaml.dump(map)

    assert.strictEqual(text, '? x: 1\n: object\n')
    assert.deepStrictEqual(yaml.load(text), { '[object Object]': 'object' })
  })

  it('dumps nested Maps used as keys using complex key notation', function () {
    const map = new Map([[new Map([['k', 'v']]), 'map-key']])
    const text = yaml.dump(map)

    assert.strictEqual(text, '? k: v\n: map-key\n')
    assert.deepStrictEqual(yaml.load(text), { '[object Object]': 'map-key' })
  })

  it('dumps nested Maps, arrays of Maps and Maps of arrays', function () {
    const data = [
      new Map([['a', [1, new Map([['z', 9]])]]])
    ]
    const text = yaml.dump(data)

    assert.strictEqual(text, '- a:\n    - 1\n    - z: 9\n')
    assert.deepStrictEqual(yaml.load(text), [{ a: [1, { z: 9 }] }])

    const nested = new Map([['outer', new Map([['inner', new Map([['deep', 1]])]])]])
    assert.deepStrictEqual(yaml.load(yaml.dump(nested)), { outer: { inner: { deep: 1 } } })
  })

  it('dumps a Map at the root of the document', function () {
    assert.deepStrictEqual(yaml.load(yaml.dump(new Map([['a', 1]]))), { a: 1 })
  })

  it('sorts Map keys when sortKeys is true', function () {
    const map = new Map([['b', 1], ['a', 2], ['c', 3]])

    assert.strictEqual(yaml.dump(map, { sortKeys: true }), 'a: 2\nb: 1\nc: 3\n')
  })

  it('sorts Map keys with a sortKeys function, receiving the actual keys', function () {
    const map = new Map([[10, 'a'], [2, 'b'], [1, 'c']])
    const seen = []

    yaml.dump(map, {
      sortKeys (a, b) {
        seen.push([a, b])
        return a - b
      }
    })

    assert.strictEqual(yaml.dump(map, { sortKeys: (a, b) => a - b }), '1: c\n2: b\n10: a\n')
    assert.ok(seen.some(pair => typeof pair[0] === 'number'))
  })

  it('passes Map keys and values to a function replacer and lets it drop pairs', function () {
    const map = new Map([['a', 1], ['b', 2], ['c', 3]])
    const calls = []

    const text = yaml.dump(map, {
      replacer (key, value) {
        if (key === '') return value
        calls.push([key, value])
        assert.ok(this instanceof Map)
        if (value === 2) return undefined
        return value * 10
      }
    })

    assert.deepStrictEqual(calls, [['a', 1], ['b', 2], ['c', 3]])
    assert.strictEqual(text, 'a: 10\nc: 30\n')
    assert.deepStrictEqual(yaml.load(text), { a: 10, c: 30 })
  })

  it('applies flowLevel to Maps', function () {
    const map = new Map([['a', 1], ['b', 2]])

    assert.strictEqual(yaml.dump(map, { flowLevel: 0 }), '{a: 1, b: 2}\n')

    const nested = { outer: new Map([['a', 1], ['b', new Map([['c', 2]])]]) }
    assert.strictEqual(yaml.dump(nested, { flowLevel: 1 }),
      'outer: {a: 1, b: {c: 2}}\n')
  })

  it('writes complex keys in flow collections with explicit key markers', function () {
    const map = new Map([[[1, 2], 'a'], [{ x: 1 }, 'b']])
    const text = yaml.dump(map, { flowLevel: 0 })

    assert.strictEqual(text, '{? [1, 2]: a, ? {x: 1}: b}\n')
    assert.deepStrictEqual(yaml.load(text), { '1,2': 'a', '[object Object]': 'b' })
  })

  it('skips invalid Map values and pairs with skipInvalid', function () {
    const map = new Map([
      ['ok', 1],
      ['fn', function () { return 1 }],
      ['nested', new Map([['bad', /re/], ['good', 2]])]
    ])

    assert.throws(() => yaml.dump(map), yaml.YAMLException)

    const text = yaml.dump(map, { skipInvalid: true })
    assert.deepStrictEqual(yaml.load(text), {
      ok: 1,
      nested: { good: 2 }
    })
  })

  it('uses anchors and aliases for duplicated Maps (and expands them with noRefs)', function () {
    const shared = new Map([['k', 'v']])

    const text = yaml.dump({ a: shared, b: shared })
    assert.strictEqual(text, 'a: &ref_0\n  k: v\nb: *ref_0\n')
    const loaded = yaml.load(text)
    assert.deepStrictEqual(loaded, { a: { k: 'v' }, b: { k: 'v' } })
    assert.strictEqual(loaded.a, loaded.b)

    const textNoRefs = yaml.dump({ a: shared, b: shared }, { noRefs: true })
    assert.strictEqual(textNoRefs, 'a:\n  k: v\nb:\n  k: v\n')
    const loadedNoRefs = yaml.load(textNoRefs)
    assert.notStrictEqual(loadedNoRefs.a, loadedNoRefs.b)

    // duplicates inside Maps behave the same way
    const inMap = new Map([['a', shared], ['b', shared]])
    assert.strictEqual(yaml.dump(inMap), text)
    assert.strictEqual(yaml.dump(inMap, { noRefs: true }), textNoRefs)
  })

  it('anchors a complex Map key when the same object is referenced again', function () {
    const key = { id: 1 }
    const map = new Map([[key, 'first'], ['other', key]])

    const text = yaml.dump(map)
    assert.strictEqual(text, '? &ref_0\n  id: 1\n: first\nother: *ref_0\n')
    assert.deepStrictEqual(yaml.load(text), {
      '[object Object]': 'first',
      other: { id: 1 }
    })
  })

  it('still refuses to dump a Set', function () {
    assert.throws(() => yaml.dump(new Set([1, 2])), /unacceptable kind of an object to dump/)
    assert.throws(() => yaml.dump({ s: new Set([1]) }), /unacceptable kind of an object to dump/)
  })
})
