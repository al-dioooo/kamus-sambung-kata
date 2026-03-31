import "@/styles/globals.css"
import type { AppProps } from "next/app"

import { Poppins, Geist_Mono } from "next/font/google"

const poppins = Poppins({
    weight: ["100", "200", "300", "400", "500", "600", "700"],
    variable: '--font-poppins',
    subsets: ['latin']
})

const geistMono = Geist_Mono({
    weight: ["100", "200", "300", "400", "500", "600", "700"],
    variable: '--font-geist-mono',
    subsets: ['latin']
})

export default function App({ Component, pageProps }: AppProps) {
    return (
        <div className={`${poppins.variable} ${geistMono.variable}`}>
            <Component {...pageProps} />
        </div>
    )
}
