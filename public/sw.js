self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Ben's Investment Research", {
      body: data.body ?? "",
      icon: "/favicon.ico",
    })
  );
});
