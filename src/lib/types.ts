export type MediaItem = {
  type: 'video' | 'image';
  url: string;
  filename: string;
};

export type ParseResult = {
  ok: true;
  type: 'video' | 'image' | 'carousel';
  title?: string;
  thumbnail?: string;
  items: MediaItem[];
};

export type ParseError = {
  ok: false;
  error: string;
  code?:
    | 'INVALID_URL'
    | 'NOT_FOUND'
    | 'PRIVATE'
    | 'LOGIN_REQUIRED'
    | 'NETWORK'
    | 'UNKNOWN';
};
