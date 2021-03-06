'use strict';

const util = require('util');
const jwt = require('jsonwebtoken');
const jwksRSA = require('jwks-rsa');

const getToken = require('./get-token');
const verifyToken = require('./verify-token');

const {
  AUTH0_JWKS_URI,
  AUTH0_TOKEN_ISSUER,
  AUTH0_AUDIENCE,
  WORKSPACE_ID_OIDC_CLAIM
} = process.env;

// See: https://github.com/auth0/node-jwks-rsa#usage
const jwksClient = jwksRSA({
  cache: true,
  rateLimit: true,
  jwksUri: AUTH0_JWKS_URI
});

const getSigningKey = util.promisify(jwksClient.getSigningKey);

// See: https://github.com/auth0/node-jsonwebtoken#jwtverifytoken-secretorpublickey-options-callback
const verifyJwt = util.promisify(jwt.verify);

/**
 * AWS API Gateway lambda authorizer that uses Auth0 as the third party auth
 * provider.
 *
 * This lambda will:
 *  1. Extract the bearer token from the "Authorization" request header.
 *  2. Fetch the JWKS from Auth0 and verify the token signature, issuer and
 *     audience claims.
 *  3. Return an IAM Policy document with "Effect" set to "Allow" when the
 *     token has been verified.
 *
 * @param {Object} event - HTTP input
 * @param {Object} context - AWS lambda context
 *
 * @return {Promise} Resolves with an "auth response" (Principal ID, IAM Policy and Context)
 *
 * For more info on HTTP input see:
 * https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 *
 * For more info on AWS lambda context see:
 * https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
 */
module.exports.verifyBearer = async (event, context) => {
  try {
    const token = getToken(event);

    /*
      The "verifiedData" object will have the following properties:

      {
        iss: 'https://upstandfm.eu.auth0.com/',
        sub: 'auth0|5e1dfacx01kaafxe0euy10d4',
        aud: [
          'https://api.upstand.fm',
          'https://upstandfm.eu.auth0.com/userinfo'
        ],
        iat: 1568732539611,
        exp: 1568732539611,
        azp: 'sVzDxfYdkXkHx8u7ldanP8pqTjPzw11c',
        scope: 'openid profile email'
      }

    */
    const verifiedData = await verifyToken(
      token,
      jwt.decode,
      getSigningKey,
      verifyJwt,
      AUTH0_TOKEN_ISSUER,
      AUTH0_AUDIENCE
    );

    const userId = verifiedData.sub;

    // The "event.methodArn" has the format:
    // "arn:aws:execute-api:region:accountId:apiId/stage/httpVerb/"
    //
    // For more info see:
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-control-access-using-iam-policies-to-invoke-api.html#api-gateway-calling-api-permissions
    const [apiId, apiEnv] = event.methodArn.split('/');

    const authResponse = {
      principalId: userId,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',

            // Allow access to all resources of the API, if the token is
            // verified
            // This format allows the policy document to be cached
            Resource: `${apiId}/${apiEnv}/*`
          }
        ]
      },

      // NOTE!
      // You can NOT set a JSON object or array as a valid value of any key in
      // the context object
      // It must be either a String, Number or Boolean
      context: {
        userId,
        scope: verifiedData.scope,
        workspaceId: verifiedData[WORKSPACE_ID_OIDC_CLAIM]
      }
    };
    return authResponse;
  } catch (err) {
    // Provided by Serverless Framework
    if (context && context.captureError) {
      context.captureError(err);
    }

    // Error MUST be "Unauthorized" EXACTLY for APIG to return a 401
    throw new Error('Unauthorized');
  }
};
