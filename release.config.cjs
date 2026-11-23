/**
 * Versões pelo semantic-release, a partir dos commits (Conventional Commits).
 *
 * Com ONLY_VERSION=1 (job `version`, em dry-run) só calcula a próxima versão e a grava em `.version`;
 * os builds a colocam no Cargo.toml. Sem ela (job `release`), grava a versão no Cargo.toml e no
 * Cargo.lock, cria a tag e a release no GitHub com os binários e commita a versão ([skip ci]).
 *
 * @type {import('semantic-release').GlobalConfig}
 */

const setVersion =
  'sed -i "/^\\[workspace.package\\]/,/^\\[/s/^version = \\".*\\"/version = \\"${nextRelease.version}\\"/" Cargo.toml && cargo update --workspace';

const onlyVersion = [
  '@semantic-release/commit-analyzer',
  ['@semantic-release/exec', { generateNotesCmd: 'echo "${nextRelease.version}" > .version' }],
];

const release = [
  '@semantic-release/commit-analyzer',
  '@semantic-release/release-notes-generator',
  ['@semantic-release/exec', { prepareCmd: setVersion }],
  [
    '@semantic-release/github',
    {
      assets: [
        { path: 'release/rsModMaster-linux-x64.tar.gz', name: 'rsModMaster-linux-x64-${nextRelease.version}.tar.gz' },
        { path: 'release/rsModMaster-macos-arm64.tar.gz', name: 'rsModMaster-macos-arm64-${nextRelease.version}.tar.gz' },
        { path: 'release/rsModMaster-windows-x64.zip', name: 'rsModMaster-windows-x64-${nextRelease.version}.zip' },
      ],
      // sem comentários em issues e PRs: o GITHUB_TOKEN do job só tem o necessário para a release
      successComment: false,
      failComment: false,
      releasedLabels: false,
    },
  ],
  [
    '@semantic-release/git',
    {
      assets: ['Cargo.toml', 'Cargo.lock'],
      message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ],
];

module.exports = {
  branches: ['main', { name: 'next', prerelease: 'preview' }],
  plugins: process.env.ONLY_VERSION ? onlyVersion : release,
};
