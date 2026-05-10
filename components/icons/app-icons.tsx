import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function AddTaskIcon(props: IconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M9 15V9M9 9V3M9 9H3M9 9L11.25 9M15 9L13.5 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TaskCheckIcon(props: IconProps) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M0.75 6L4.25 8.75C4.25 8.75 6.25 3.25 9.15 0.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M12.0834 5.83335L7.91671 10L9.25311 11.3364M12.0834 14.1667L11.0207 13.104"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DragHandleIcon(props: IconProps) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M11.25 5.5C11.25 6.4665 10.4665 7.25 9.5 7.25C8.5335 7.25 7.75 6.4665 7.75 5.5C7.75 4.5335 8.5335 3.75 9.5 3.75C10.4665 3.75 11.25 4.5335 11.25 5.5Z"
        fill="currentColor"
      />
      <path
        d="M11.25 18.5C11.25 19.4665 10.4665 20.25 9.5 20.25C8.5335 20.25 7.75 19.4665 7.75 18.5C7.75 17.5335 8.5335 16.75 9.5 16.75C10.4665 16.75 11.25 17.5335 11.25 18.5Z"
        fill="currentColor"
      />
      <path
        d="M11.25 12C11.25 12.9665 10.4665 13.75 9.5 13.75C8.5335 13.75 7.75 12.9665 7.75 12C7.75 11.0335 8.5335 10.25 9.5 10.25C10.4665 10.25 11.25 11.0335 11.25 12Z"
        fill="currentColor"
      />
      <path
        d="M16.25 18.5C16.25 19.4665 15.4665 20.25 14.5 20.25C13.5335 20.25 12.75 19.4665 12.75 18.5C12.75 17.5335 13.5335 16.75 14.5 16.75C15.4665 16.75 16.25 17.5335 16.25 18.5Z"
        fill="currentColor"
      />
      <path
        d="M16.25 12C16.25 12.9665 15.4665 13.75 14.5 13.75C13.5335 13.75 12.75 12.9665 12.75 12C12.75 11.0335 13.5335 10.25 14.5 10.25C15.4665 10.25 16.25 11.0335 16.25 12Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M6 6L6 15C6 16.8638 6 17.7956 6.30448 18.5307C6.71046 19.5108 7.48915 20.2895 8.46927 20.6955C9.20435 21 10.1362 21 12 21H12.5C13.8956 21 14.5933 21 15.1611 20.8278C16.4395 20.44 17.44 19.4395 17.8278 18.1611C18 17.5933 18 16.8956 18 15.5M6 6H4M6 6L18 6M18 6H20M18 6V11.5M9 3L15 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
