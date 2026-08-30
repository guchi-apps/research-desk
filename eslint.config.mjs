import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    // .shared-context/・.shared-prompts/ はGitHub Actions実行時にチェックアウトされる
    // 他リポジトリ由来のディレクトリで、読み取り専用として扱う（このリポジトリのCLAUDE.md）。
    // deploy/ecosystem.config.js はPM2用の意図的なCommonJSファイル。
    ignores: [".shared-context/**", ".shared-prompts/**", "deploy/ecosystem.config.js"],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;
