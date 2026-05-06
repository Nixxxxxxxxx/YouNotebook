"use client";

import { forwardRef, useEffect, useImperativeHandle } from "react";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { BubbleMenu, EditorContent, useEditor } from "@tiptap/react";
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
          placeholder: ({ node }) =>
            node.type.name === "heading"
              ? "Заголовок"
              : "Запиши то, что стоит сохранить...",
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

      window.requestAnimationFrame(() => editor.commands.focus("end"));
    }, [editor, entryId]);

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

    return (
      <div className={styles.editorFrame}>
        {editor ? (
          <BubbleMenu
            editor={editor}
            className={styles.bubbleMenu}
            shouldShow={({ editor: currentEditor, from, to }) =>
              currentEditor.isEditable && from !== to
            }
            tippyOptions={{
              duration: 120,
              offset: [0, 8],
              placement: "bottom-start",
            }}
          >
            <button
              type="button"
              aria-label="Заголовок"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 2 }).run();
              }}
            >
              Aa
            </button>
            <button
              type="button"
              aria-label="Жирный"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor.chain().focus().toggleBold().run();
              }}
            >
              B
            </button>
            <button
              type="button"
              aria-label="Курсив"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor.chain().focus().toggleItalic().run();
              }}
            >
              I
            </button>
            <button
              type="button"
              aria-label="Подчеркнутый"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor.chain().focus().toggleUnderline().run();
              }}
            >
              U
            </button>
          </BubbleMenu>
        ) : null}

        <EditorContent editor={editor} />
      </div>
    );
  },
);
