interface IconProps {
  className?: string;
  size?: number;
}

export default function WalletIcon({ className = '', size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M21 8V6C21 4.89543 20.1046 4 19 4H5C3.89543 4 3 4.89543 3 6V18C3 19.1046 3.89543 20 5 20H19C20.1046 20 21 19.1046 21 18V16M16 12H20C20.5523 12 21 12.4477 21 13V15C21 15.5523 20.5523 16 20 16H16C14.8954 16 14 15.1046 14 14C14 12.8954 14.8954 12 16 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
