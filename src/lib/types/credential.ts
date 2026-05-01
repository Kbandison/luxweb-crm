export const CREDENTIAL_KINDS = [
  'password',
  'api_key',
  'url',
  'sftp',
  'note',
] as const;

export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export const CREDENTIAL_KIND_LABEL: Record<CredentialKind, string> = {
  password: 'Login',
  api_key: 'API key',
  url: 'URL',
  sftp: 'SFTP',
  note: 'Secure note',
};
