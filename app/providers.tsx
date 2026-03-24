/**
 * app/providers.tsx
 * 全局 Provider 组件
 * 包裹 NextAuth SessionProvider 等全局状态提供者
 */

"use client";

import { SessionProvider } from "next-auth/react";

/**
 * 全局提供者包装组件
 * @param children - 子组件
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
