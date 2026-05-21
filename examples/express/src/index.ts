import express, { Request, Response } from 'express';
import { createAuth } from '@custom-auth/core';
import { PrismaAdapter } from '@custom-auth/prisma';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

const auth = createAuth({
  secret: 'super-secret-express',
  adapter: new PrismaAdapter(prisma),
  session: {
    expiresIn: '7d'
  }
});

// Adapter function to convert Express req to standard Web API Request
async function adaptRequest(req: Request): Promise<globalThis.Request> {
  const url = `http://${req.headers.host}${req.url}`;
  const init: RequestInit = {
    method: req.method,
    headers: req.headers as HeadersInit,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = JSON.stringify(req.body);
  }

  return new globalThis.Request(url, init);
}

app.all('/api/auth/*', async (req, res) => {
  try {
    const webRequest = await adaptRequest(req);
    const webResponse = await auth.handleRequest(webRequest);
    
    // Convert Web API Response back to Express res
    res.status(webResponse.status);
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const text = await webResponse.text();
    res.send(text);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`);
});
