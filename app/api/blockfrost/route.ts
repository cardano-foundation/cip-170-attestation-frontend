import { NextRequest, NextResponse } from 'next/server';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { getCardanoNetwork, getBlockfrostUrl } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const { txHash, apiKey } = await request.json();

    if (!txHash || !apiKey) {
      return NextResponse.json(
        { error: 'Missing txHash or apiKey' },
        { status: 400 }
      );
    }

    // Get the configured network and corresponding Blockfrost URL
    const network = getCardanoNetwork();
    const baseUrl = getBlockfrostUrl(network);

    const blockfrost = new BlockFrostAPI({
      projectId: apiKey,
      customBackend: baseUrl,
    });

    const txMetadata = await blockfrost.txsMetadata(txHash);

    if (!txMetadata || txMetadata.length === 0) {
      return NextResponse.json(
        { error: 'No metadata found for this transaction' },
        { status: 404 }
      );
    }

    // Convert metadata array to object
    const metadataObj: Record<string, any> = {};
    txMetadata.forEach((item: any) => {
      metadataObj[item.label] = item.json_metadata;
    });

    return NextResponse.json({ metadata: metadataObj });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch metadata' },
      { status: 500 }
    );
  }
}
