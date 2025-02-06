import "mocha";
import { expect } from "chai";
import { JSONRPCServer, JSONRPCClient } from "./index.js";

describe("JSONRPCClient and JSONRPCServer", () => {
  let server: JSONRPCServer;
  let client: JSONRPCClient;

  let id: number;

  beforeEach(() => {
    id = 0;

    server = new JSONRPCServer();
    client = new JSONRPCClient(
      (request) => {
        return server.receive(request).then((response) => {
          if (response) {
            client.receive(response);
          }
        });
      },
      () => ++id,
    );
  });

  it("sending a request should resolve the result", () => {
    beforeEach(() => {
      server.addMethod("foo", () => "bar");

      return client
        .request("foo", undefined)
        .then((result) => expect(result).to.equal("bar"));
    });
  });

  it("sending a notification should send a notification", () => {
    let received: string;

    beforeEach(() => {
      server.addMethod("foo", ([text]: any[]) => (received = text));

      client.notify("foo", ["bar"]);

      expect(received).to.equal("bar");
    });
  });
});
