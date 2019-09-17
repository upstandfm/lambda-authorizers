# Lambda authorizers

AWS lambda authorizers.

## Table of contents

- [Development](#development)
- [Auth0 lambda authorizer](#auth0-authorizer)

## Development

### Code linting and formatting

Code is automatically linted and formatted on commit, using [ESLint](https://eslint.org/) and [Prettier](https://prettier.io/).

### Available scripts

In the project directory, you can run:

#### `npm test`

Runs all (unit) tests.

#### `npm run lint`

Lints all code using ESLint.

#### `npm run lint:format`

Lints all code using ESLint, and formats it using Prettier.

#### `npm run sls:debug`

Prints the `serverless.yaml` configuration.

## Auth0 authorizer

The implementation is based on [serverless auth](https://blog.danillouz.dev/serverless-auth/).

The [lambda authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html) controls API access by using a bearer auth strategy. This is provided by [Auth0](https://auth0.com/) and means that clients can only access a protected API by using a valid access token.

### Lambda authorizer output

On successful auth, the lambda authorizer will return an [output](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-output.html) that contains a `context`.
This context object contains properties that can be used by a lambda proxy handler. One of those properties is the `scope`, which the API (i.e. lambda proxy handler) can use to make authorization decisions.

This information can be extracted from the `event` Object like this:

```js
module.exports.handler = async event => {
  const { authorizer } = event.requestContext;
  const { scope } = authorizer;
};
```

More information about the request context can be found [here](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html#context-variable-reference).

### Error handling and CORS

In general, the lambda authorizer will return either `4XX` or `5XX` error responses (API Gateway).

The `4XX` error response can be triggered by throwing `"Unauthorized"`:

```js
// MUST match the error EXACTLY!
throw new Error('Unauthorized');
```

Any other throwed errors, will result in a `5XX` error response.

Additionally, the proper CORS headers must be returned by the API, because when the lambda authorizer fails, it won't execute the lambda proxy handler. This can be achieved by adding a custom "API Gateway Response" on the API that uses the lambda authorizer:

```yml
service: my-api
app: my-app
org: upstandfm

provider:
  name: aws
  runtime: nodejs10.x
  memorySize: 128
  timeout: 3

functions:
  getSecret:
    handler: src/handler.secret
    events:
      - http:
          path: /secret
          method: get
          authorizer:
            arn: 'LAMBDA_AUTHORIZER_ARN'
            resultTtlInSeconds: 0
            identitySource: method.request.header.Authorization
            identityValidationExpression: '^Bearer [-0-9a-zA-z\.]*$'
            type: token

# This returns the proper CORS headers when an authorized request fails, which
# applies to 4XX and 5XX responses.
#
# For more info see:
# - https://serverless.com/blog/cors-api-gateway-survival-guide/
# - https://docs.aws.amazon.com/apigateway/latest/developerguide/supported-gateway-response-types.html
resources:
  Resources:
    GatewayResponseDefault4XX:
      Type: 'AWS::ApiGateway::GatewayResponse'
      Properties:
        ResponseParameters:
          gatewayresponse.header.Access-Control-Allow-Origin: "'*'"
          gatewayresponse.header.Access-Control-Allow-Headers: "'*'"
        ResponseType: DEFAULT_4XX
        RestApiId:
          Ref: 'ApiGatewayRestApi'
    GatewayResponseDefault5XX:
      Type: 'AWS::ApiGateway::GatewayResponse'
      Properties:
        ResponseParameters:
          gatewayresponse.header.Access-Control-Allow-Origin: "'*'"
          gatewayresponse.header.Access-Control-Allow-Headers: "'*'"
        ResponseType: DEFAULT_5XX
        RestApiId:
```

### Configuration

The lambda authorizer must be configured via the following environment variables:

| Var Name             | Required | Description                                                                                                                                                                                                    |
| -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH0_TOKEN_ISSUER` | Yes      | The token provider. This must have the format of `https://<TENANT>.<REGION>.auth0.com/`.                                                                                                                       |
| `AUTH0_JWKS_URI`     | Yes      | The token provider. This must have the format of `https://<TENANT>.<REGION>.auth0.com/.well-known/jwks.json`.                                                                                                  |
| `AUTH0_AUDIENCE`     | Yes      | The audience for "whom" the access token is intended for. This must be the `Identifier` (NOT the `Id`!) of an Auth0 API Client, and must match the audience used by the client that obtained the access token. |
