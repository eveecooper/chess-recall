# Chess Recall

A responsive, browser-only chess memory trainer by Av. Replay a game or reconstruct a position, with optional Lichess study storage.

## Run

Use Node 24 or later.

```sh
npm ci
npm run dev
npm test
npm run build
```

Open the development URL printed by Vite. Paste PGN or FEN into the always-available import form, or try the included examples. Local libraries are saved in IndexedDB. Export PGN for a portable backup. Browser storage can be cleared by the browser; it is not cloud synchronization.

## Training

- PGN: drag pieces or enter strict SAN. Choose both sides or auto-play the opponent. Check each move or grade at the end. Promotion offers a piece selector.
- FEN: select a palette piece and tap squares, or use the hand to move pieces. Submit, correct the highlighted squares, and resubmit.
- Percentage is correctly placed answer pieces divided by answer pieces. Extra pieces only increase missed squares; every square whose piece differs is counted once.
- Reveal is free and starts collapsed. Flip manually or enable flip each turn. Continue the current position on Lichess.

## Lichess

Open a public study URL without signing in, or sign in with OAuth PKCE to read private studies and import new chapters. The app requests only study:read and study:write. Tokens are kept in sessionStorage, never in source or the library cache. Sign-out revokes the token; cached study data remains on the device. A study holds up to 64 chapters, so use the library selector to switch studies. Create studies on Lichess itself.

The OAuth redirect is the current site origin and path. Localhost or HTTPS is required for Web Crypto. Authentication and write integration need an end-to-end test with your Lichess account after deployment.

## Reuse the core

```sh
npm run build:lib
npm pack
```

Install the resulting tarball in another TypeScript project:

```ts
import { importText, Session, gradeFen } from 'chess-recall';
const chapter = importText('1. e4 e5 *')[0];
const session = new Session(chapter, { check: 'each', side: 'white' });
```

The pure core lives in src/core. It has no UI or network dependency. The library is intended for ESM bundlers such as Vite. The UI lives in src/main.ts and src/style.css; browser persistence and Lichess access are separate modules.

## Deploy

The included GitHub Actions workflow builds, tests, and deploys to GitHub Pages on pushes to main. In repository Settings → Pages, choose GitHub Actions as the source. Relative assets also allow deployment of dist/ on other static hosts.

## License and credits

GPL-3.0-or-later. See LICENSE. Includes dependencies on Lichess chessops and Chessground under GPL-3.0-or-later. Piece artwork is Chessground’s bundled Cburnett set; retain upstream attribution. This project is not affiliated with Lichess. Reuse, modification, and redistribution are welcome under the license terms.
