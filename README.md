# json-rpc-2.0

Let your client and server talk over function calls under [JSON-RPC 2.0 spec](https://www.jsonrpc.org/specification).

- Protocol agnostic
  - Use over HTTP, WebSocket, TCP, UDP, inter-process, whatever else
    - Easy migration from HTTP to WebSocket, for example
- No external dependencies
  - Keep your package small
  - Stay away from dependency hell
- First-class TypeScript support
  - Written in TypeScript

## Install

`npm install --save json-rpc-2.0`

## Example

The example uses HTTP for communication protocol, but it can be anything.

### Server

```javascript
const express = require("express");
const bodyParser = require("body-parser");
const { JSONRPCServer } = require("json-rpc-2.0");

const server = new JSONRPCServer();

// First parameter is a method name.
// Second parameter is a method itself.
// A method takes JSON-RPC params and returns a result.
// It can also return a promise of the result.
server.addMethod("echo", ({ text }) => text);
server.addMethod("log", ({ message }) => console.log(message));

const app = express();
app.use(bodyParser.json());

app.post("/json-rpc", (req, res) => {
  const jsonRPCRequest = req.body;
  // server.receive takes a JSON-RPC request and returns a promise of a JSON-RPC response.
  // Alternatively, you can use server.receiveJSON, which takes JSON string as is (in this case req.body).
  server.receive(jsonRPCRequest).then((jsonRPCResponse) => {
    if (jsonRPCResponse) {
      res.json(jsonRPCResponse);
    } else {
      // If response is absent, it was a JSON-RPC notification method.
      // Respond with no content status (204).
      res.sendStatus(204);
    }
  });
});

app.listen(80);
```

#### With authentication

To hook authentication into the API, inject custom params:

```javascript
const server = new JSONRPCServer();

// The method can also take a custom parameter as the second parameter.
// Use this to inject whatever information that method needs outside the regular JSON-RPC request.
server.addMethod("echo", ({ text }, { userID }) => `${userID} said ${text}`);

app.post("/json-rpc", (req, res) => {
  const jsonRPCRequest = req.body;
  const userID = getUserID(req);

  // server.receive takes an optional second parameter.
  // The parameter will be injected to the JSON-RPC method as the second parameter.
  server.receive(jsonRPCRequest, { userID }).then((jsonRPCResponse) => {
    if (jsonRPCResponse) {
      res.json(jsonRPCResponse);
    } else {
      res.sendStatus(204);
    }
  });
});

const getUserID = (req) => {
  // Do whatever to get user ID out of the request
};
```

### Client

```javascript
import { JSONRPCClient } from "json-rpc-2.0";

// JSONRPCClient needs to know how to send a JSON-RPC request.
// Tell it by passing a function to its constructor. The function must take a JSON-RPC request and send it.
const client = new JSONRPCClient((jsonRPCRequest) =>
  fetch("http://localhost/json-rpc", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(jsonRPCRequest),
  }).then((response) => {
    if (response.status === 200) {
      // Use client.receive when you received a JSON-RPC response.
      return response
        .json()
        .then((jsonRPCResponse) => client.receive(jsonRPCResponse));
    } else if (jsonRPCRequest.id !== undefined) {
      return Promise.reject(new Error(response.statusText));
    }
  })
);

// Use client.request to make a JSON-RPC request call.
// The function returns a promise of the result.
client
  .request("echo", { text: "Hello, World!" })
  .then((result) => console.log(result));

// Use client.notify to make a JSON-RPC notification call.
// By definition, JSON-RPC notification does not respond.
client.notify("log", { message: "Hello, World!" });
```

#### With authentication

Just like `JSONRPCServer`, you can inject custom params to `JSONRPCClient` too:

```javascript
const client = new JSONRPCClient(
  // It can also take a custom parameter as the second parameter.
  (jsonRPCRequest, { token }) =>
    fetch("http://localhost/json-rpc", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`, // Use the passed token
      },
      body: JSON.stringify(jsonRPCRequest),
    }).then((response) => {
      // ...
    })
);

// Pass the custom params as the third argument.
client.request("echo", { text: "Hello, World!" }, { token: "foo's token" });
client.notify("log", { message: "Hello, World!" }, { token: "foo's token" });
```

#### With timeout

Sometimes you don't want to wait for the response indefinitely. You can use `timeout` to automatically fail the request after certain delay:

```typescript
const client = new JSONRPCClient(/* ... */);

client
  .timeout(10 * 1000) // Automatically fails if it didn't get a response within 10 sec
  .request("echo", { text: "Hello, World!" });

// Create a custom error response
const createTimeoutJSONRPCErrorResponse = (
  id: JSONRPCID
): JSONRPCErrorResponse =>
  createJSONRPCErrorResponse(id, 123, "Custom error message");

client
  .timeout(10 * 1000, createTimeoutJSONRPCErrorResponse)
  .request("echo", { text: "Hello, World!" });
```

### Bi-directional JSON-RPC

For bi-directional JSON-RPC, use `JSONRPCServerAndClient`.

```javascript
const webSocket = new WebSocket("ws://localhost");

const serverAndClient = new JSONRPCServerAndClient(
  new JSONRPCServer(),
  new JSONRPCClient((request) => {
    try {
      webSocket.send(JSON.stringify(request));
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  })
);

webSocket.onmessage = (event) => {
  serverAndClient.receiveAndSend(JSON.parse(event.data.toString()));
};

// On close, make sure to reject all the pending requests to prevent hanging.
webSocket.onclose = (event) => {
  serverAndClient.rejectAllPendingRequests(
    `Connection is closed (${event.reason}).`
  );
};

serverAndClient.addMethod("echo", ({ text }) => text);

serverAndClient
  .request("add", { x: 1, y: 2 })
  .then((result) => console.log(`1 + 2 = ${result}`));
```

### Error handling

To respond an error, reject with an `Error`. On the client side, the promise will be rejected with an `Error` object with the same message.

```javascript
server.addMethod("fail", () =>
  Promise.reject(new Error("This is an error message."))
);

client.request("fail").then(
  () => console.log("This does not get called"),
  (error) => console.error(error.message) // Outputs "This is an error message."
);
```

If you want to return a custom error response, either use [advanced APIs](#advanced-apis) or implement `mapErrorToJSONRPCErrorResponse`:

```typescript
import {
  createJSONRPCErrorResponse,
  JSONRPCErrorResponse,
  JSONRPCID,
  JSONRPCServer,
} from "json-rpc-2.0";

const server = new JSONRPCServer();

server.mapErrorToJSONRPCErrorResponse = (
  id: JSONRPCID,
  error: any
): JSONRPCErrorResponse => {
  return createJSONRPCErrorResponse(
    id,
    error?.code || 0,
    error?.message || "An unexpected error occurred",
    // Optional 4th argument. It maps to error.data of the response.
    { foo: "bar" }
  );
};
```

### Advanced APIs

Use the advanced APIs to handle raw JSON-RPC messages.

#### Server

```typescript
import { JSONRPC, JSONRPCResponse, JSONRPCServer } from "json-rpc-2.0";

const server = new JSONRPCServer();

// Advanced method takes a raw JSON-RPC request and returns a raw JSON-RPC response
server.addMethodAdvanced(
  "doSomething",
  (jsonRPCRequest: JSONRPCRequest): PromiseLike<JSONRPCResponse> => {
    if (isValid(jsonRPCRequest.params)) {
      return {
        jsonrpc: JSONRPC,
        id: jsonRPCRequest.id,
        result: "Params are valid",
      };
    } else {
      return {
        jsonrpc: JSONRPC,
        id: jsonRPCRequest.id,
        error: {
          code: -100,
          message: "Params are invalid",
          data: jsonRPCRequest.params,
        },
      };
    }
  }
);
```

#### Client

```typescript
import {
  JSONRPC,
  JSONRPCClient,
  JSONRPCRequest,
  JSONRPCResponse,
} from "json-rpc-2.0";

const send = () => {
  // ...
};
let nextID: number = 0;
const createID = () => nextID++;

// To avoid conflict ID between basic and advanced method request, inject a custom ID factory function.
const client = new JSONRPCClient(send, createID);

const jsonRPCRequest: JSONRPCRequest = {
  jsonrpc: JSONRPC,
  id: createID(),
  method: "doSomething",
  params: {
    foo: "foo",
    bar: "bar",
  },
};

// Advanced method takes a raw JSON-RPC request and returns a raw JSON-RPC response
client
  .requestAdvanced(jsonRPCRequest)
  .then((jsonRPCResponse: JSONRPCResponse) => {
    if (jsonRPCResponse.error) {
      console.log(
        `Received an error with code ${jsonRPCResponse.error.code} and message ${jsonRPCResponse.error.message}`
      );
    } else {
      doSomethingWithResult(jsonRPCResponse.result);
    }
  });
```

## Build

`npm run build`

## Test

`npm test`
