import {
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
  ActionGetResponse,
  ActionPostRequest,
} from "@solana/actions";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { BONK, DEFAULT_ADDRESS, DEFAULT_USDC_AMOUNT, USDC } from "../contant";
import { CreateDCAParamsV2, DCA, Network } from "@jup-ag/dca-sdk";

export const GET = async (req: Request) => {
  try {
    const requestUrl = new URL(req.url);
    const { toPubkey } = validatedQueryParams(requestUrl);

    const baseHref = new URL(
      `/api/actions/dca?to=${toPubkey.toBase58()}`,
      requestUrl.origin
    ).toString();

    const payload: ActionGetResponse = {
      title: "DCA - SOL",
      icon: new URL("https://i.postimg.cc/NfwX2L9Q/dca-blink.png", requestUrl.origin).toString(),
      description: "DCA SOL at your finger tips",
      label: "Order",
      links: {
        actions: [
          {
            label: "DCA 6 USDC",
            href: `${baseHref}?amount={6}`,
          },
          {
            label: "DCA 15 USDC",
            href: `${baseHref}?amount={15}`,
          },
          {
            label: "DCA 50 USDC",
            href: `${baseHref}?amount={50}`,
          },
          {
            label: "DCA USDC",
            href: `${baseHref}&amount={amount}`,
            parameters: [
              {
                name: "amount",
                label: "Enter the amount of USDC to DCA SOL",
                required: true,
              },
            ],
          },
        ],
      },
    };
    // @ts-ignore
    return Response.json(payload, {
      headers: ACTIONS_CORS_HEADERS,
    });
  } catch (err) {
    console.log(err);
    let message = "An unknown error occurred";
    if (typeof err == "string") message = err;
    return new Response(message, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }
};

export const OPTIONS = GET;

export const POST = async (req: Request) => {
  try {
    const requestUrl = new URL(req.url);
    const { amount, toPubkey } = validatedQueryParams(requestUrl);

    const body: ActionPostRequest = await req.json();

    // validate the client provided input
    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      return new Response('Invalid "account" provided', {
        status: 400,
        headers: ACTIONS_CORS_HEADERS,
      });
    }

    const connection = new Connection("https://api.mainnet-beta.solana.com");

    // ensure the receiving account will be rent exempt
    const minimumBalance = await connection.getMinimumBalanceForRentExemption(
      0 // note: simple accounts that just store native SOL have `0` bytes of data
    );
    if (amount * LAMPORTS_PER_SOL < minimumBalance) {
      throw `account may not be rent exempt: ${toPubkey.toBase58()}`;
    }

    const transaction = new Transaction();

    const dca = new DCA(connection, Network.MAINNET);

    const params: CreateDCAParamsV2 = {
      payer: toPubkey, 
      user: toPubkey,
      inAmount: BigInt(amount), 
      inAmountPerCycle: BigInt(amount),
      cycleSecondsApart: BigInt(86400), // 1 day between each order -> 60 * 60 * 24
      inputMint: USDC,
      outputMint: BONK,
      minOutAmountPerCycle: null, 
      maxOutAmountPerCycle: null,
      startAt: null,
    };

    const { tx, dcaPubKey } = await dca.createDcaV2(params);

    transaction.add(tx);

    // set the end user as the fee payer
    transaction.feePayer = account;

    transaction.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: `DCA ${amount} SOL with ${toPubkey.toBase58()}`,
      },
    });

    // @ts-ignore
    return Response.json(payload, {
      headers: ACTIONS_CORS_HEADERS,
    });
  } catch (err) {
    console.log(err);
    let message = "An unknown error occurred";
    if (typeof err == "string") message = err;
    return new Response(message, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }
};

function validatedQueryParams(requestUrl: URL) {
  let toPubkey: PublicKey = DEFAULT_ADDRESS;
  let amount: number = DEFAULT_USDC_AMOUNT;

  try {
    if (requestUrl.searchParams.get("to")) {
      toPubkey = new PublicKey(requestUrl.searchParams.get("to")!);
    }
  } catch (err) {
    throw "Invalid input query parameter: to";
  }

  try {
    if (requestUrl.searchParams.get("amount")) {
      amount = parseFloat(requestUrl.searchParams.get("amount")!) * 1000000;
    }

    if (amount <= 0) throw "amount is too small";
  } catch (err) {
    throw "Invalid input query parameter: amount";
  }

  return {
    amount,
    toPubkey,
  };
}
