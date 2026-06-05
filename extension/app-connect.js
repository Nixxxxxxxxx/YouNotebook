(function () {
  const root = document.querySelector("[data-quietly-extension-token]");
  const status = document.querySelector("#quietly-extension-connect-status");
  const token = root?.getAttribute("data-quietly-extension-token");
  const email = root?.getAttribute("data-quietly-extension-email");

  function setStatus(message, isError = false) {
    if (!status) return;

    status.textContent = message;
    status.style.color = isError ? "#ffb29f" : "#9fceff";
  }

  if (!token) {
    setStatus("Не получилось найти token подключения.", true);
    return;
  }

  chrome.runtime.sendMessage(
    {
      email,
      token,
      type: "QUIETLY_STORE_AUTH_TOKEN"
    },
    (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        setStatus("Расширение не ответило. Проверь, что оно установлено.", true);
        return;
      }

      setStatus("Готово. Расширение подключено, вкладку можно закрыть.");
    }
  );
})();
