"use client";

import { forwardRef, useEffect, useImperativeHandle } from "react";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { DiaryContent } from "@/lib/diary/types";
import styles from "./rich-editor.module.css";

export type RichEditorHandle = {
  focus(): void;
  toggleBold(): void;
  toggleItalic(): void;
  toggleUnderline(): void;
};

type RichEditorProps = {
  entryId: string;
  content: DiaryContent;
  onChange(content: DiaryContent, plainText: string): void;
};

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(
  function RichEditor({ entryId, content, onChange }, ref) {
    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3],
          },
        }),
        Underline,
        Placeholder.configure({
          placeholder: "Запиши то, что стоит сохранить...",
        }),
      ],
      content,
      editorProps: {
        attributes: {
          class: styles.editor,
          spellcheck: "true",
        },
      },
      onUpdate({ editor: currentEditor }) {
        onChange(
          currentEditor.getJSON() as DiaryContent,
          currentEditor.getText({ blockSeparator: "\n" }),
        );
      },
    });

    useEffect(() => {
      if (!editor) {
        return;
      }

      editor.commands.setContent(content, false);
      window.requestAnimationFrame(() => editor.commands.focus("end"));
    }, [content, editor, entryId]);

    useImperativeHandle(
      ref,
      () => ({
        focus() {
          editor?.commands.focus();
        },
        toggleBold() {
          editor?.chain().focus().toggleBold().run();
        },
        toggleItalic() {
          editor?.chain().focus().toggleItalic().run();
        },
        toggleUnderline() {
          editor?.chain().focus().toggleUnderline().run();
        },
      }),
      [editor],
    );

    return <EditorContent editor={editor} className={styles.editorFrame} />;
  },
);
