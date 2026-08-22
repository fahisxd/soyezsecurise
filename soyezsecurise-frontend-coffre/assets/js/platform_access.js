(function () {
    "use strict";

    var userAgent = navigator.userAgent || "";
    var platform = navigator.userAgentData && navigator.userAgentData.platform
        ? navigator.userAgentData.platform
        : "";
    var isAndroidBrowser = /Android/i.test(userAgent) || /Android/i.test(platform);

    if (!isAndroidBrowser) { return; }

    document.documentElement.classList.add("android-browser");

    if (document.documentElement.hasAttribute("data-team-page")) {
        window.location.replace("index.html");
        return;
    }

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("[data-team-feature]").forEach(function (element) {
            element.remove();
        });
    });
}());
