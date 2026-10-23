/**
 * Cached MongoDB Client for Next.js Server Components and API Routes
 */

import { MongoClient, Db } from "mongodb";

const uri =
  process.env.MONGODB_URI ||
  "mongodb+srv://prayxistechnologies_db_user:3ELAR327CBt6w8Jy@cluster0.lc8hqsq.mongodb.net/labelflow?retryWrites=true&w=majority";
const dbName = process.env.MONGODB_DB || "labelflow";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient | null> | undefined;
}

let prodClientPromise: Promise<MongoClient | null> | null = null;

async function createAndConnectClient(): Promise<MongoClient | null> {
  if (!uri) return null;
  try {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      tls: true,
    });
    await client.connect();
    // Verify connection with quick ping
    await client.db(dbName).command({ ping: 1 });
    return client;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("Next.js MongoDB notice: cluster unreachable (operating with in-memory fallback):", msg);
    return null;
  }
}

export async function getMongoClient(): Promise<MongoClient | null> {
  if (!uri) return null;

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = createAndConnectClient();
    }
    return global._mongoClientPromise;
  } else {
    if (!prodClientPromise) {
      prodClientPromise = createAndConnectClient();
    }
    return prodClientPromise;
  }
}

export async function getMongoDb(): Promise<Db | null> {
  try {
    const connectedClient = await getMongoClient();
    if (!connectedClient) return null;
    return connectedClient.db(dbName);
  } catch {
    return null;
  }
}
