import test from 'node:test'
import assert from 'node:assert/strict'
import { matchLiving, personPassed, rosterMessage } from '../src/living.js'

const people = [
  { id: 'evelyn', name: 'Evelyn Example', role: 'Mother', email: 'evelyn@example.test' },
  { id: 'vivian', name: 'Vivian Example', role: 'Matriarch', email: '' },
  { id: 'lee', name: 'Lee Example', role: 'Father, passed away', email: 'lee@example.test' },
  { id: 'jordan', name: 'Jordan Example', role: 'Cousin', email: 'jordan@example.test' },
  { id: 'sam', name: 'Sam Example', role: 'Cousin', email: '' },
  { id: 'sam-2', name: 'Sam Example', role: 'Niece', email: '' },
]

test('passed records follow the family site directory check', () => {
  assert.equal(personPassed(people[0]), true)
  assert.equal(personPassed(people[1]), true)
  assert.equal(personPassed(people[2]), true)
  assert.equal(personPassed(people[3]), false)
})

test('an account email maps to one living roster row', () => {
  const match = matchLiving({
    email: 'Jordan@example.test',
    profile: { first_name: 'Someone', last_name: 'Else' },
    people,
  })
  assert.equal(match.person.id, 'jordan')
})

test('a passed email does not fall through to another living name', () => {
  const match = matchLiving({
    email: 'lee@example.test',
    profile: { first_name: 'Jordan', last_name: 'Example' },
    people,
  })
  assert.equal(match.error, 'passed')
  assert.equal(match.person, undefined)
})

test('a profile name maps when it matches one living person', () => {
  const match = matchLiving({
    email: '',
    profile: { first_name: 'Jordan', last_name: 'Example' },
    people,
  })
  assert.equal(match.person.id, 'jordan')
})

test('two living people with the same name are not guessed', () => {
  const match = matchLiving({
    email: '',
    profile: { first_name: 'Sam', last_name: 'Example' },
    people,
  })
  assert.equal(match.error, 'ambiguous')
})

test('an account that is not on the roster stays out', () => {
  const match = matchLiving({
    email: 'new@example.test',
    profile: { first_name: 'New', last_name: 'Person' },
    people,
  })
  assert.equal(match.error, 'none')
  assert.match(rosterMessage('none'), /living family roster/)
})
