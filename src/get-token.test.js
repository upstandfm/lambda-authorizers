'use strict';

const getToken = require('./get-token');

describe('getToken(event)', () => {
  it('throws when event type is not "TOKEN"', () => {
    const event = {
      type: 'REQUEST'
    };

    expect(() => {
      getToken(event);
    }).toThrow(/^Authorizer must be of type "TOKEN"$/);
  });

  it('throws without "Authorization" header value', () => {
    const event = {
      type: 'TOKEN',
      authorizationToken: ''
    };

    expect(() => {
      getToken(event);
    }).toThrow(/^Authorization header with "Bearer TOKEN" must be provided$/);
  });

  it('throws with invalid "Authorization" header value', () => {
    const event = {
      type: 'TOKEN',
      authorizationToken: 'boarer 1234'
    };

    expect(() => {
      getToken(event);
    }).toThrow(/^Invalid bearer token$/);
  });

  it('returns token for valid "Authorization" header value', () => {
    const token = '1234';
    const event = {
      type: 'TOKEN',
      authorizationToken: `Bearer ${token}`
    };

    const result = getToken(event);
    expect(result).toEqual(token);
  });
});
