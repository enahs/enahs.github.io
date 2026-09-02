(() => {
    const hotReload = () => {
      const ws = new WebSocket("ws://localhost:3000/ws")
      ws.onopen = (event) => {
        console.log("new websocket connection opened!")
      }
      ws.onmessage = (event) => {
        console.log("received message", event)
        if (event.data === "reload") window.location.reload()
      }
      ws.onclose = (event) => {
        console.log("Closing connection...")
        ws = null;
        setInterval(() => hotReload(), 4000)
      }
      ws.onerror = (event) => console.log("an error occured", event)
    }

    hotReload()
})();