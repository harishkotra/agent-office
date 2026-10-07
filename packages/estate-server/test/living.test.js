import test from 'node:test'
import assert from 'node:assert/strict'
import { matchLiving, personPassed, rosterMessage } from '../src/living.js'

const memorial = [
  { id: 'evelyn', name: 'Evelyn Rosborough', role: 'Mother of Vivian McCowan', email: 'evelyn@example.test' },
  { id: 'lee', name: 'Lee Rosborough', role: 'Father', email: 'lee@example.test' },
  { id: 'vivian', name: 'Vivian McCowan', role: 'Last Matriarch', email: 'vivian@example.test' },
  { id: 'sammy', name: 'Sammy McCowan III', role: 'Son', email: 'sammy@example.test' },
  { id: 'jeremiah', name: 'Jeremiah Devon McCowan', role: 'Son', email: 'jeremiah@example.test' },
]

const people = [
  ...memorial,
  { id: 'jordan', name: 'Jordan Example', role: 'Cousin', email: 'jordan@example.test' },
  { id: 'other', name: 'Jordan Example', role: 'Cousin', email: '' },
]

test('the memorial list cannot walk, even without passed in the role', () => {
  for (const person of memorial) {
    assert.equal(personPassed(person), true, person.name)
    const match = matchLiving({ email: person.email, people })
    assert.equal(match.error, 'passed', person.name)
    assert.equal(match.person, undefined)
  }
})

test('a role that says passed is still refused', () => {
  assert.equal(personPassed({ id: 'x', name: 'Alex Example', role: 'Cousin, passed away' }), true)
})

test('an account email maps to one living roster row', () => {
  const match = matchLiving({ email: 'Jordan@example.test', people })
  assert.equal(match.person.id, 'jordan')
})

test('the same name without that email does not walk as them', () => {
  const match = matchLiving({
    email: 'new@example.test',
    people,
  })
  assert.equal(match.error, 'none')
  assert.match(rosterMessage('none'), /living family roster/)
})

test('two roster rows with one email are not guessed', () => {
  const match = matchLiving({
    email: 'shared@example.test',
    people: [
      { id: 'a', name: 'A Example', role: 'Cousin', email: 'shared@example.test' },
      { id: 'b', name: 'B Example', role: 'Cousin', email: 'shared@example.test' },
    ],
  })
  assert.equal(match.error, 'ambiguous')
})
