export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type: string;
  title?: string;
  username?: string;
  photo?: TelegramChatPhoto;
};

export type TelegramChatPhoto = {
  small_file_id: string;
  small_file_unique_id?: string;
  big_file_id: string;
  big_file_unique_id?: string;
};

export type TelegramPhotoSize = {
  file_id: string;
  file_unique_id?: string;
  width: number;
  height: number;
  file_size?: number;
};

export type TelegramDocument = {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

export type TelegramAnimation = {
  file_id: string;
  file_unique_id?: string;
  width?: number;
  height?: number;
  duration?: number;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  thumbnail?: TelegramPhotoSize;
  thumb?: TelegramPhotoSize;
};

export type TelegramMessageEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
  language?: string;
  custom_emoji_id?: string;
  user?: TelegramUser;
};

export type TelegramInlineKeyboardButton = {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: {
    url: string;
  };
};

export type TelegramReplyMarkup = {
  inline_keyboard?: TelegramInlineKeyboardButton[][];
};

export type TelegramMessage = {
  message_id: number;
  media_group_id?: string;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  forward_from_chat?: TelegramChat;
  forward_origin?: {
    type: string;
    chat?: TelegramChat;
  };
  chat: TelegramChat;
  date: number;
  text?: string;
  entities?: TelegramMessageEntity[];
  caption?: string;
  caption_entities?: TelegramMessageEntity[];
  photo?: TelegramPhotoSize[];
  animation?: TelegramAnimation;
  document?: TelegramDocument;
  reply_markup?: TelegramReplyMarkup;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
};
