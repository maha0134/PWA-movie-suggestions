const APP = {
    DBsearch: null,  //the indexedDB
    DBsuggest: null,
	searchVersion: 1,
    suggestVersion:1,
    sw: null,
    isOnline: 'onLine' in navigator && navigator.onLine,
    tmdbBASEURL: 'https://api.themoviedb.org/3/',
    tmdbAPIKEY: '?api_key=662a9f5f9bd7ca76976bbb8b24822ddd',
    tmdbIMAGEBASEURL: 'http://image.tmdb.org/t/p/',
	form: document.getElementById('searchForm'),
    nextPage:"",
    objSearch: { 
        keyword:""
    },
    objSuggest: {
        movieid:0
    },
    results: [],
    init: ()=>{
        //when the page loads
        //open the database
        APP.openDatabase(APP.registerSW); //register the service worker after the DB is open
    },
    openDatabase: (nextStep)=>{
        //open the databases-searchStore and suggestStore
        let dbOpenRequestSearch = indexedDB.open('searchStore',APP.searchVersion);
        dbOpenRequestSearch.onupgradeneeded = (ev)=> {
            APP.DBsearch = ev.target.result;
            try {
                APP.DBsearch.deleteObjectStore('searchStore');
            } catch(err) {
                console.log('error deleting old DB');
            }
            let options = {
                keyPath: 'keyword',
                autoIncrement: false,
            };
            let searchStore = APP.DBsearch.createObjectStore('searchStore', options);
        };

        dbOpenRequestSearch.onerror = (err)=> {
            console.log(err.message);
        };

        dbOpenRequestSearch.onsuccess = (ev)=> {
            APP.DBsearch = ev.target.result;
            console.log(APP.DBsearch.name, 'Search DB ready');
            
            //open second database after the first one is successfully opened
            
            let dbOpenRequestSuggest = indexedDB.open('suggestStore',APP.suggestVersion);
            dbOpenRequestSuggest.onupgradeneeded = (ev)=> {
                APP.DBsuggest = ev.target.result;
                try {
                    APP.DBsuggest.deleteObjectStore('suggestStore');
                } catch(err) {
                    console.log('error deleting old DB');
                }
                let options = {
                    keyPath: 'movieid',
                    autoIncrement: false,
                };
                let suggestStore = APP.DBsuggest.createObjectStore('suggestStore', options);
            };

            dbOpenRequestSuggest.onerror = (err)=> {
                console.log(err.message);
            };

            dbOpenRequestSuggest.onsuccess= (ev)=>{
                APP.DBsuggest = ev.target.result;
                console.log(APP.DBsuggest.name, 'Suggest DB ready')
                nextStep();
            };
        };
    },
    registerSW: ()=>{
        //register the service worker
        if('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch((err) => {
                console.warn('could not register Service Worker',err);
            });
            navigator.serviceWorker.ready.then((reg)=> {
                APP.sw = reg.active;
                APP.addListeners(APP.pageSpecific);
            })
        }
    },
    addListeners: (callback)=>{
        //add listeners
        APP.form.addEventListener('submit', APP.searchFormSubmitted)
        window.addEventListener('online', APP.changeOnlineStatus);
        window.addEventListener('offline', APP.changeOnlineStatus);
        navigator.serviceWorker.addEventListener('message',APP.messageReceived);
        callback();
    },
    pageSpecific:()=>{
        //anything that happens specifically on each page
        if(document.body.id === 'results'){
            //on the results page
            let urlKeyword = new URLSearchParams(window.location.search);
            let keyword = urlKeyword.get('query');
            document.title=`Search-${keyword}`;
            APP.getDBResults('searchStore', keyword);
        }
        if(document.body.id === 'suggest'){
            //on the suggest page
            let urlKeyword = new URLSearchParams(window.location.search);
            let keyword = urlKeyword.get('id');
            let title = urlKeyword.get('title');
            document.title=`Similar-${title}`;
            APP.getDBResults('suggestStore',keyword,title);
        }
    },
    createTransaction: (storeName)=>{
        //create a transaction to use for some interaction with the database, based on the storeName
        if(storeName ==='searchStore') {
            let tx= APP.DBsearch.transaction(storeName,'readwrite');
            return tx;
        } else {
            let tx = APP.DBsuggest.transaction(storeName,'readwrite');
            return tx;
        }
    },
    checkDB: (storeName, keyValue, title)=> {
        //checks if entry exists in DB, if yes, adds to the results array
        let tx = APP.createTransaction(storeName);
        tx.onerror = (err)=> {
            console.log('failed to create transaction', err.message);
        };
        tx.oncomplete = ()=> {
            if(title) { //title will only be there if we are dealing with Suggest page
                APP.getSuggestedResults(keyValue,title);
            } else {
                APP.getSearchResults(keyValue);
            }
        }
        let store = tx.objectStore(storeName);
        let getResult = store.get(keyValue);
        getResult.onsuccess = (ev)=> {
            if(getResult.result) { //getResult.result returns undefined if no match found
                APP.results = getResult.result.results;
                console.log('match found');
            } else {
                APP.results=[]; //clear any existing results, if there
                console.log('match not found');
            }
        }
    },
    getDBResults: (storeName, keyValue,title) => {
        //return the results from storeName where it matches keyValue
        let tx = APP.createTransaction(storeName);
        tx.onerror = (err)=> {
            console.log('failed to create transaction', err.message);
        };
        tx.oncomplete = (ev)=> {
            APP.displayCards(keyValue,title);
        }
        let store = tx.objectStore(storeName);
        let getResult = store.get(keyValue);
        getResult.onsuccess = (ev)=> {
            if(getResult.result) {
                APP.results=getResult.result.results;
            }
        }
        

    },
    addResultsToDB: (obj, storeName)=>{
        //save the obj passed in to the appropriate store
        let tx = APP.createTransaction(storeName);
        let store = tx.objectStore(storeName);
        tx.onerror = (err)=> {
            console.log('failed to create transaction', err.message);
        };
        tx.oncomplete = (ev)=> {
            APP.navigate();
        }
        let addRequest = store.add(obj);

        addRequest.onerror= (err)=> {
            console.log('error adding result to database', err.message);
        }

        addRequest.onsuccess = (ev)=> {
            console.log('record added successfully to ', storeName);
        }
        
    },
    changeOnlineStatus: (ev)=>{
        //when the browser goes online or offline
        APP.isOnline = ev.type === 'online' ? true : false;
        APP.sendMessage({ ONLINE: APP.isOnline });
        if(!APP.isOnline) {
            let status = document.querySelector('.online');
            status.className='offline';
        } else {
            let status= document.querySelector('.offline');
            status.className='online';
        }
    },
    messageReceived: (ev)=>{
        //ev.data
        console.log(ev.data);
    },
    sendMessage: (msg)=>{
        //send a message to the service worker
        navigator.serviceWorker.ready.then((reg) => {
            reg.active.postMessage(msg);
        });
    },
    searchFormSubmitted: (ev)=>{
        ev.preventDefault();
        let query = APP.form.inputSearch.value;
        if(query) {
            //clear the array
            APP.results=[];
            APP.checkDB('searchStore',query);
        }
    },
    cardListClicked: (ev)=>{
        let target = ev.target.closest('.card');
        if(target) {
            APP.checkDB('suggestStore',target.dataset.id,target.dataset.title);
        }
    },
    getSearchResults: (keyword)=>{
        APP.nextPage = `/searchResults.html?query=${keyword}`
            if(APP.results.length === 0) { //check if array is empty
                if(APP.isOnline) {  //if no results in DB and online, do a new fetch
                APP.objSearch.keyword = keyword;
                let url = new URL(`${APP.tmdbBASEURL}search/movie${APP.tmdbAPIKEY}&query=${keyword}`);
                APP.getData(url);
                } else { //else navigate to error page
                    APP.nextPage=`/404page.html`;
                    APP.navigate();
                } 
            }else { // if there are results, just display
                APP.navigate();
            }
    },
    getSuggestedResults:(movieId,title)=>{
        APP.nextPage = `/suggestedMovies.html?id=${movieId}&title=${title}`
            if(APP.results.length <1) { //check if there are any results
                //if no results, and online do a fetch
                if(APP.isOnline) {
                    APP.objSuggest.movieid = movieId;
                    let url = new URL(`${APP.tmdbBASEURL}/movie/${movieId}/recommendations${APP.tmdbAPIKEY}`);
                    APP.getData(url);
                } else {
                    APP.nextPage=`/404page.html`;
                    APP.navigate();
                }
            } else {
                APP.navigate();
            }
        
        //check in DB for match of movieid in suggestStore
        //if no match in DB do a fetch 
        // APP.displayCards is the callback
    },
    getData: (url)=>{
        fetch(url)
            .then(resp=>{
                if(resp.status >= 400){
                    throw new NetworkError(`Failed fetch to ${url}`, resp.status, resp.statusText);
                }
                return resp.json();
            })
            .then(contents=>{
                if(contents.results.length===0){ // if there are no results
                    APP.navigate();
                } else {
                    contents.results.forEach(result=> {
                            const {id,title,release_date,poster_path,popularity}=result
                            APP.results.push({id,title,release_date,popularity,poster_path})
                        })
                        //check if pathname begins with 'search' to direct to the search store database
                        if(url.pathname.startsWith('/3/search')) {
                            console.log('search database');
                            APP.objSearch.results = APP.results;
                            APP.addResultsToDB(APP.objSearch,'searchStore');
                        } else {
                            console.log('suggest database');
                            APP.objSuggest.results = APP.results;
                            APP.addResultsToDB(APP.objSuggest,'suggestStore');
                        }
                }
            })
            .catch(err=>{
                //handle the NetworkError if fetch fails
                APP.nextPage = `/404page.html`;
                APP.navigate();
            })
    },
    displayCards: (keyword,title)=>{
        //display all the movie cards
        //title will only exist if this function is called from suggestedMovies page
        if(APP.results.length<1) { //check if the search returned any results
            let sorryMessage = document.querySelector('.displayMessage');
            if(!title) {
                sorryMessage.innerHTML = `Sorry! But looks like your search for <span class="keyword">${keyword}</span> returned no results`;
            } else {
                sorryMessage.innerHTML = `Sorry! We could not find any movies similar to <span class="keyword">${title}</span>`
            }
        } else {
            let displayedKeyword = document.querySelector('.keyword');
            if(!title) {
                displayedKeyword.textContent = keyword;
            } else {
                displayedKeyword.textContent = title;
            }
            let list = document.querySelector('.list-unstyled')
            let df=new DocumentFragment();
            APP.results.forEach((movie) => {
                let card = document.createElement('li');
                card.classList.add('card');
                card.setAttribute("data-id",movie.id);
                card.setAttribute("data-title",movie.title);
                let div = document.createElement('div');
                div.classList.add('img-wrap');
                let img = document.createElement('img');
                if(!movie.poster_path) {
                    img.src = './img/placeholder.png';
                } else {
                    img.src = `${APP.tmdbIMAGEBASEURL}w500${movie.poster_path}`;
                }
                img.alt = `poster of the movie ${movie.title}`;
                div.append(img);
                let movieTitle = document.createElement('p');
                movieTitle.textContent = movie.title;
                let moviePopularity = document.createElement('p');
                if(movie.popularity) {
                    let i =(Math.floor(Math.random()*5 +1)); //generates a random integer b/w 1-5(inclusive of both)
                    //generate star icons
                    moviePopularity.textContent = `Popularity:`;
                    for(let c=0; c<i; c++){
                        let star = document.createElement('i');
                        star.textContent = "grade";
                        star.classList.add('material-icons');
                        star.classList.add('md-36');
                        moviePopularity.append(star);
                    }
                } else {
                    moviePopularity.textContent = `Popularity: NA`;
                }
                let releaseDate = document.createElement('p');
                if(movie.release_date) { //for upcoming movies, release date property doesn't exist
                    releaseDate.textContent = `Released: ${movie.release_date.substring(0,4)}`;
                }else {
                    releaseDate.textContent = `Released: NA`;
                }
                card.append(div,movieTitle,moviePopularity,releaseDate);
                df.append(card);
            });
            list.append(df);
            list.addEventListener('click',APP.cardListClicked);
        }
    },
    navigate: ()=>{
        //change the current page
        window.location = APP.nextPage;
    }
}

document.addEventListener('DOMContentLoaded', APP.init);

class NetworkError extends Error {
    constructor(msg, status, statusText){
        super(msg);
        this.status = status;
        this.statusText = statusText;
    }
}