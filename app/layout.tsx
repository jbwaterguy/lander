import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Your Water Report | Aqua Clear Water Systems",
  description: "Personalized water quality report for your home from Aqua Clear Water Systems - Tennessee's #1 provider of water filtration systems.",
  icons: {
    icon: "https://aquaclearws.com/wp-content/uploads/2023/10/cropped-cropped-aqua-clear-web-transparent_logo-color-32x32.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
