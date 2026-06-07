import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "sonner"
import { Providers } from "@/components/layout/Providers"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "StaySync - 숙박 플랫폼 통합 관리",
  description: "자리톡, 위홈, 에어비앤비, 아고다, 부킹닷컴을 한 화면에서 관리하세요. 이중예약을 방지하고 운영을 간소화합니다.",
  keywords: "단기임대, 숙박관리, 이중예약방지, 자리톡, 위홈, 에어비앤비, 채널관리",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        <Providers>
          {children}
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  )
}
