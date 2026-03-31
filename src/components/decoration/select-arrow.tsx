type Props = {
    className?: string
    scale?: number
}

export default function SelectArrow({ className, scale = 1 }: Props) {
    // Base dimensions
    const baseWidth = 28
    const baseHeight = 20

    return (
        <svg
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            width={baseWidth * scale}
            height={baseHeight * scale}
            viewBox="0 0 28 20"
            fill="currentColor"
        >
            <path fillRule="evenodd" d="M27 9.629 9 15.258l-9-5.63L9 4l18 5.629Zm-18.5-2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" clipRule="evenodd" />
            <circle cx={25.5} cy={2.5} r={2.5} />
            <circle cx={25.5} cy={17.5} r={2.5} />
        </svg>
    )
}