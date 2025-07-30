import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getGroupData } from "../../../lib/semaphore/group";
import { generateProof } from "@semaphore-protocol/proof";
import { createIdentity } from "../../../lib/semaphore/identity";
import { Group } from "@semaphore-protocol/group";
import path from "path";
import fs from "fs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

    try {
      const session = await getServerSession(req, res, {
        providers: [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          authorization: { params: { prompt: "select_account" } },
          }),
        ],
        secret: process.env.NEXTAUTH_SECRET,
      });

    if (!session || !session.user?.email) {
      return res.status(401).json({ message: "Unauthorized: Please log in" });
      }

      const { signal } = req.body;
      if (!signal) {
      return res.status(400).json({ message: "Signal is required" });
      }
      
    // 1. Create identity
      const identity = createIdentity(session.user.email);
    const commitment = identity.commitment.toString();
      
    // 2. Load group data
      const groupData = await getGroupData();

    // 3. Check membership
    if (!groupData.members.includes(commitment)) {
      return res.status(403).json({
        message: "Forbidden: Your identity is not a member of the group."
      });
    }

    // 4. Prepare group
    const group = new Group(groupData.id, groupData.treeDepth);
    groupData.members.forEach(member => {
      // Only add valid numeric members
      if (member && !isNaN(member) && !isNaN(Number(member))) {
        try {
          group.addMember(BigInt(member));
        } catch (_) {
          // Ignore invalid members
        }
      } else {
        console.warn("Skipping invalid group member:", member);
      }
    });

    // 5. Use group.root as the externalNullifier (Semaphore v3 recommended, zk-friendly)
    const externalNullifier = group.root;

    // 6. Pass the signal directly (string or number). Semaphore v3 hashes it inside the circuit.

    // 7. Load circuit files
    const wasmFilePath = path.join(process.cwd(), "public/semaphore/20/semaphore.wasm");
    const zkeyFilePath = path.join(process.cwd(), "public/semaphore/20/semaphore.zkey");

    if (!fs.existsSync(wasmFilePath) || !fs.existsSync(zkeyFilePath)) {
      return res.status(500).json({ message: "Missing .wasm or .zkey file" });
    }

    // 8. Generate ZK proof
    let fullProof;
    try {
      fullProof = await generateProof(
        identity,
        group,
        externalNullifier,
        signal,
        { wasmFilePath, zkeyFilePath }
      );
    } catch (err) {
      console.error("generateProof threw error:", err);
      return res.status(500).json({
        message: "Error generating proof",
        error: err.message
      });
    }

    if (!fullProof?.proof) {
      return res.status(500).json({
        message: "Proof generation failed: missing proof"
      });
    }

    return res.status(200).json({ fullProof });

    } catch (error) {
    console.error("Unhandled error during proof generation:", error);
      res.status(500).json({ 
      message: "Unhandled error generating proof",
        error: error.message 
      });
    } 
  }
