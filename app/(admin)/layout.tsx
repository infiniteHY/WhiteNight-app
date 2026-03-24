/**
 * app/(admin)/layout.tsx
 * 管理端页面布局
 * 包含顶部导航栏和侧边栏
 */

import Navbar from "@/components/layout/navbar";
import Sidebar from "@/components/layout/sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
