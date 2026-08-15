const server_link = "http://127.0.0.1:8000";


(function($) {

	var	$window = $(window),
		$body = $('body'),
		$wrapper = $('#wrapper'),
		$header = $('#header'),
		$footer = $('#footer'),
		$main = $('#main'),
		$main_articles = $main.children('article');

	
		breakpoints({
			xlarge:   [ '1281px',  '1680px' ],
			large:    [ '981px',   '1280px' ],
			medium:   [ '737px',   '980px'  ],
			small:    [ '481px',   '736px'  ],
			xsmall:   [ '361px',   '480px'  ],
			xxsmall:  [ null,      '360px'  ]
		});

	
		$window.on('load', function() {
			window.setTimeout(function() {
				$body.removeClass('is-preload');
			}, 100);
		});

	
		if (browser.name == 'ie') {

			var flexboxFixTimeoutId;

			$window.on('resize.flexbox-fix', function() {

				clearTimeout(flexboxFixTimeoutId);

				flexboxFixTimeoutId = setTimeout(function() {

					if ($wrapper.prop('scrollHeight') > $window.height())
						$wrapper.css('height', 'auto');
					else
						$wrapper.css('height', '100vh');

				}, 250);

			}).triggerHandler('resize.flexbox-fix');

		}

	
		var $nav = $header.children('nav'),
			$nav_li = $nav.find('li');

		
			if ($nav_li.length % 2 == 0) {

				$nav.addClass('use-middle');
				$nav_li.eq( ($nav_li.length / 2) ).addClass('is-middle');

			}

	
		var	delay = 325,
			locked = false,
			routeToken = 0;


			// Mobile UX fix: opening Login / Store / Vault / Retrieve should always
			// start at the top of the panel, even if the previous article was scrolled.
			var resetArticleScroll = function($article) {
				var run = function() {
					window.scrollTo(0, 0);
					$('html, body').scrollTop(0);
					$main.scrollTop(0);
					if ($article && $article.length)
						$article.scrollTop(0);
				};

				run();
				window.requestAnimationFrame(run);
				setTimeout(run, 60);
			};

			var setActiveMobileTab = function(id) {
				$('.mobile-tabbar a').removeClass('active').removeAttr('aria-current');

				var map = {
					'store-password': '#mobile-storepassword',
					'Getpassword': '#mobile-getpassword'
				};

				if (map[id])
					$(map[id]).addClass('active').attr('aria-current', 'page');
			};

		
			$main._resetToHome = function() {

				locked = false;

				$body.removeClass('is-article-visible is-switching');
				$main_articles.removeClass('active').hide();
				$main.hide();
				$header.show();
				$footer.show();

				$window
					.scrollTop(0)
					.triggerHandler('resize.flexbox-fix');

			};

			$main._sync = function() {

				
					if (location.hash == ''
					||	location.hash == '#') {

						routeToken++;
						$main._resetToHome();
						return;

					}

				
					if ($main_articles.filter(location.hash).length > 0) {

						var id = location.hash.substr(1),
							$activeArticle = $main_articles.filter('.active');

						if (!$body.hasClass('is-article-visible')
						||	$activeArticle.attr('id') != id) {
							routeToken++;
							$main._show(id, false, routeToken);
						}

					}

			};

			$main._show = function(id, initial, token) {

				var $article = $main_articles.filter('#' + id);

				
					if ($article.length == 0)
						return;

					setActiveMobileTab(id);
					resetArticleScroll($article);

				
					if (typeof token == 'undefined')
						token = ++routeToken;

				

					
						if (locked || (typeof initial != 'undefined' && initial === true)) {

							
								$body.addClass('is-switching');

							
								$body.addClass('is-article-visible');

							
								$main_articles.removeClass('active');

							
								$header.hide();
								$footer.hide();

							
								$main.show();
								$article.show();

							
								$article.addClass('active');
									resetArticleScroll($article);

							
								locked = false;

							
								setTimeout(function() {
									if (token != routeToken)
										return;

									$body.removeClass('is-switching');
									$main._sync();
								}, (initial ? 1000 : 0));

							return;

						}

					
						locked = true;

				
					if ($body.hasClass('is-article-visible')) {

						
							var $currentArticle = $main_articles.filter('.active');

							$currentArticle.removeClass('active');

							
								setTimeout(function() {

									if (token != routeToken)
										return;

									
										$currentArticle.hide();

								
									$article.show();

									
										setTimeout(function() {

											if (token != routeToken)
												return;

											$article.addClass('active');
											resetArticleScroll($article);

										
											$window
												.scrollTop(0)
												.triggerHandler('resize.flexbox-fix');

										
											setTimeout(function() {
												if (token != routeToken)
													return;

												locked = false;
												$main._sync();
											}, delay);

									}, 25);

							}, delay);

					}

				
					else {

						
							$body
								.addClass('is-article-visible');

						
							setTimeout(function() {

								if (token != routeToken)
									return;

								
									$header.hide();
									$footer.hide();

								
									$main.show();
									$article.show();

								
									setTimeout(function() {

										if (token != routeToken)
											return;

										$article.addClass('active');
										resetArticleScroll($article);

										
											$window
												.scrollTop(0)
												.triggerHandler('resize.flexbox-fix');

										
										setTimeout(function() {
											if (token != routeToken)
												return;

											locked = false;
											$main._sync();
										}, delay);

									}, 25);

							}, delay);

					}

			};

			$main._hide = function(addState) {

				var $article = $main_articles.filter('.active');

				
					if (typeof addState != 'undefined'
					&&	addState === true) {
						history.pushState(null, null, '#');
						routeToken++;
					}

				
					if (!$body.hasClass('is-article-visible'))
						return;

				

					
						if (locked) {

							
								$body.addClass('is-switching');

							
								$article.removeClass('active');

							
								$article.hide();
								$main.hide();

							
								$footer.show();
								$header.show();

							
								$body.removeClass('is-article-visible');

							
								locked = false;

							
								$body.removeClass('is-switching');

							
								$main._sync();

							
								$window
									.scrollTop(0)
									.triggerHandler('resize.flexbox-fix');

							return;

						}

					
						locked = true;

				
					$article.removeClass('active');

				
					setTimeout(function() {

						
							$article.hide();
							$main.hide();

						
							$footer.show();
							$header.show();

						
							setTimeout(function() {

								$body.removeClass('is-article-visible');

								
									$window
										.scrollTop(0)
										.triggerHandler('resize.flexbox-fix');

								
									setTimeout(function() {
										locked = false;
										$main._sync();
									}, delay);

							}, 25);

					}, delay);


			};

		
			$main_articles.each(function() {

				var $this = $(this);

				
					$('<div class="close">Close</div>')
						.appendTo($this)
						.on('click', function() {
							location.hash = '';
						});

				
					$this.on('click', function(event) {
						event.stopPropagation();
					});

			});

		
			$body.on('click', function(event) {

				
					if ($body.hasClass('is-article-visible'))
						$main._hide(true);

			});

			$window.on('keyup', function(event) {

				switch (event.keyCode) {

					case 27:

						
							if ($body.hasClass('is-article-visible'))
								$main._hide(true);

						break;

					default:
						break;

				}

			});

			$window.on('hashchange', function(event) {

				
					if (location.hash == ''
					||	location.hash == '#') {

						
							event.preventDefault();
							event.stopPropagation();

						
							$main._sync();

					}

				
					else if ($main_articles.filter(location.hash).length > 0) {

						
							event.preventDefault();
							event.stopPropagation();

						
							$main._sync();

					}

			});

		
		
			if ('scrollRestoration' in history)
				history.scrollRestoration = 'manual';
			else {

				var	oldScrollPos = 0,
					scrollPos = 0,
					$htmlbody = $('html,body');

				$window
					.on('scroll', function() {

						oldScrollPos = scrollPos;
						scrollPos = $htmlbody.scrollTop();

					})
					.on('hashchange', function() {
						$window.scrollTop(oldScrollPos);
					});

			}

		

			
				$main.hide();
				$main_articles.hide();

				
					if (location.hash != ''
					&&	location.hash != '#') {
						var initialRouteToken = ++routeToken;
						$window.on('load', function() {
							$main._show(location.hash.substr(1), true, initialRouteToken);
						});
					}

})(jQuery);


document.querySelectorAll(".password-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
        const input = document.getElementById(btn.dataset.target);
        const icon = btn.querySelector("i");

        if (input.type === "password") {
            input.type = "text";
            icon.classList.replace("fa-eye", "fa-eye-slash");
        } else {
            input.type = "password";
            icon.classList.replace("fa-eye-slash", "fa-eye");
        }
    });
});
