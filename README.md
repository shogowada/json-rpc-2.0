# json-rpc-2.0
JSON-RPC 2.0 client and server lib for JavaScript.

- Protocol agnostic
    - Use over HTTP, WebSocket, TCP, UDP, inter-process, whatever else
- No external dependencies
    - Keep your package small
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
  server.receive(jsonRPCRequest).then(jsonRPCResponse => {
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

// The method can be a higher-order function (a function that returns a function).
// In that case, JSONRPCServer will inject a custom parameter to the returned function.
// Use this to inject whatever information that method needs outside the regular JSON-RPC request.
server.addMethod("echo", ({ text }) => ({ userID }) => `${userID} said ${text}`);

app.post("/json-rpc", (req, res) => {
  const jsonRPCRequest = req.body;
  const userID = getUserID(req);

  // server.receive takes an optional second parameter.
  // The parameter will be injected to the JSON-RPC method if it was a higher-order function.
  server.receive(jsonRPCRequest, { userID }).then(jsonRPCResponse => {
    if (jsonRPCResponse) {
      res.json(jsonRPCResponse);
    } else {
      res.sendStatus(204);
    }
  });
});

const getUserID = (req) => // Do whatever to get user ID out of the request
```

### Client

```javascript
// JSONRPCClient needs to know how to send a JSON-RPC request.
// Tell it by passing a function to its constructor. The function must take a JSON-RPC request and send it.
const client = new JSONRPCClient(
  (jsonRPCRequest) =>
    fetch("http://localhost/json-rpc", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(jsonRPCRequest)
    }).then(response => {
      if (response.status === 200) {
        // Use client.receive when you received a JSON-RPC response.
        return response.json().then(jsonRPCResponse => client.receive(jsonRPCResponse));
      }
    })
);

// Use client.request to make a JSON-RPC request call.
// The function returns a promise of the result.
client.request("echo", { text: "Hello, World!" }).then(result => console.log(result));

// Use client.notify to make a JSON-RPC notification call.
// By definition, JSON-RPC notification does not respond.
client.notify("log", { message: "Hello, World!" });
```

## Build

`npm run build`

## Test

`npm test`
