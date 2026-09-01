const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "research-desk",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: path.resolve(__dirname, ".."),
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      // メモリ2GBのVPS上でNext.jsが複数常駐しており、Nodeの既定ヒープ上限
      // （1プロセスあたり約1006MB）ではGCが働かず各プロセスが数百MBを抱え込む。
      // 上限を明示して早めにGCさせる。max_memory_restart は暴走時の保険。
      node_args: "--max-old-space-size=128",
      max_memory_restart: "320M",
      // PM2 は max_memory_restart による再起動やサーバー再起動後の resurrect で
      // プロセスを起動し直す際、pm2 start 時に指定した --env production を失って
      // 既定の env にフォールバックすることがある。development/3000 で起動されると
      // Apache のプロキシ先（127.0.0.1:3115）と食い違って 503 になるため、
      // 既定の env も本番と同じ値にしておく（guchi-apps/issue-deck#2259）。
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3115,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3115,
      },
    },
    {
      // 記事AI解析の実行役（#79・#86）。**アプリと同じVPS・同じユーザーで常駐させる。**
      // サブPCに渡していたころはsystemd user unitの設置という手作業が要り、リリースしても
      // 解析が動き出さなかった。PM2に載せるとデプロイのたびに配布・再起動まで揃う。
      //
      // Codex CLI（ChatGPTアカウント認証）はaide-botが同じホストの同じユーザーで使っている
      // ものをそのまま利用する（guchi-apps/aide-bot#130）。`~/.codex/auth.json`が正。
      name: "research-desk-analysis-worker",
      script: "scripts/codex-analysis-worker.mjs",
      // 拡張子からの推測に任せない。PM2が`.mjs`を知らないと、シェバンで直接実行する
      // 扱いになって`node_args`が効かなくなる。
      interpreter: "node",
      cwd: path.resolve(__dirname, ".."),
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      // 待ちに入るだけのプロセスなのでヒープは小さくてよい（重いのは子プロセスのCodex）。
      node_args: "--max-old-space-size=64",
      max_memory_restart: "128M",
      // 設定不備では終了しない作りだが、想定外の異常で落ちたときに詰めて再起動させない。
      restart_delay: 30_000,
      // 停止要求から強制終了までの猶予。実行中のCodexが道半ばで切られてもジョブは
      // リース切れ（15分）でQUEUEDへ戻るため、長く待たない。
      kill_timeout: 10_000,
      env: {
        NODE_ENV: "production",
        // 接続先・共有シークレットはアプリ本体と同じ`.env`から、ポーラー自身が読む
        // （PM2は`.env`を読まないうえ、ここへ書くとシークレットが`~/.pm2/dump.pm2`に残る）。
        //
        // PATHだけはPM2デーモンから引き継げないことがあるため、`pm2 start`したシェルの
        // ものを渡す。`codex`はnpmのグローバル導入で、nodeと同じbinディレクトリに居る。
        ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      },
      env_production: {
        NODE_ENV: "production",
        ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      },
    },
  ],
};
