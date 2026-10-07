import test from 'node:test'
import assert from 'node:assert/strict'
import { accountMessage, profileDisplayName } from '../src/profile.js'

test('the grounds name comes from the profile fields', () => {
  assert.equal(
    profileDisplayName({
      name_prefix: 'Mx',
      first_name: 'Jordan',
      middle_name: 'Lee',
      last_name: 'Example',
      second_last_name: '',
      name_suffix: 'Jr',
    }),
    'Mx Jordan Lee Example Jr',
  )
})

test('a blank profile is not given a made-up name', () => {
  assert.equal(profileDisplayName({ first_name: '  ', last_name: '' }), '')
  assert.equal(profileDisplayName(null), '')
  assert.match(accountMessage('profile'), /site member list/)
  assert.match(accountMessage('name'), /no name/)
})
