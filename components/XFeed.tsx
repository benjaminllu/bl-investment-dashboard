"use client";

import Script from "next/script";

export default function XFeed() {
  return (
    <>
      <a
        className="twitter-timeline"
        href="https://twitter.com/aleabitoreddit"
      >
        Posts by aleabitoreddit
      </a>
      <Script src="https://platform.x.com/widgets.js" />
    </>
  );
}
