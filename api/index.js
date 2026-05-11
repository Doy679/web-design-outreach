import { handleRequest } from "../dist/server.js";

export default async function handler(request, response) {
  await handleRequest(request, response);
}
