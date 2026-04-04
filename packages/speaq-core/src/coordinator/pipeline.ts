/**
 * SPEAQ Core - Message Pipeline
 * PORT from plexaris-agent-core/coordinator/pipeline.py
 * PRD Section 5: compress -> encrypt -> pad -> sign -> transport
 */

export type PipelineStage = (data: Buffer) => Promise<Buffer> | Buffer;

export class Pipeline {
  private stages: Array<{ name: string; fn: PipelineStage }> = [];

  addStage(name: string, fn: PipelineStage): void {
    this.stages.push({ name, fn });
  }

  removeStage(name: string): void {
    this.stages = this.stages.filter((s) => s.name !== name);
  }

  async process(input: Buffer): Promise<Buffer> {
    let data = input;
    for (const stage of this.stages) {
      data = await stage.fn(data);
    }
    return data;
  }

  getStages(): string[] {
    return this.stages.map((s) => s.name);
  }
}

/**
 * Create the standard SPEAQ message pipeline
 * PRD Section 5: compress -> encrypt -> pad -> sign -> transport
 */
export function createMessagePipeline(): Pipeline {
  const pipeline = new Pipeline();

  // Stage 1: Compress (reduce size before encryption)
  pipeline.addStage("compress", (data: Buffer) => {
    // For now, pass through. zlib compression added when needed.
    return data;
  });

  // Stage 2: Encrypt (AES-256-GCM via Double Ratchet)
  // Added by the encryption layer when ratchet state is available
  // pipeline.addStage("encrypt", ...)

  // Stage 3: Pad (all messages same size to prevent traffic analysis)
  pipeline.addStage("pad", (data: Buffer) => {
    const BLOCK_SIZE = 4096; // 4KB blocks
    const paddedLength = Math.ceil(data.length / BLOCK_SIZE) * BLOCK_SIZE;
    const padded = Buffer.alloc(paddedLength);
    data.copy(padded);
    // First 4 bytes = original length (for unpadding)
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(data.length);
    return Buffer.concat([lengthBuf, padded]);
  });

  return pipeline;
}

/**
 * Remove padding from a received message
 */
export function unpad(data: Buffer): Buffer {
  const originalLength = data.readUInt32BE(0);
  return data.subarray(4, 4 + originalLength);
}
