window.addEventListener("load",inici,false);

function inici(){
    
    
    nom_invocador = document.getElementById("nom_invocador");
    var consultar = document.getElementById("consultar");
    
    consultar.addEventListener("click",getNameSummoner,false);
    
    API_KEY = "RGAPI-0699e2fb-8d21-47cb-93c9-bab799cd25e0";

    
    
}

function getNameSummoner(){
    var jugador = nom_invocador.value;
    
    var a = new XMLHttpRequest();
    
    $.ajax({
                
        headers: {
        "User-Agent": "Riot-Games-Developer-Portal",
        "Accept-Language": "en-US",
        "Accept-Charset": "ISO-8859-1,utf-8",
        "Origin":"https://developer.riotgames.com",   
        },
        
        type: 'GET',
        url: "https://euw.api.pvp.net/api/lol/euw/v1.4/summoner/by-name/"+jugador+"?api_key="+API_KEY,
        dataType: 'jsonp',

        success: function(data){
            
            var token = data.authResponse.accessToken;
            
            console.log(token);
            
            dates_get = data;
            
            var codi_html = "";
            
            $.each(data, function(key, value){
                
                codi_html = '<div class="infoinvocador"'+
                            '<h2>Nombre: '+value.name+'</h2>'+
                            '<h2>Nivel de invocador: '+value.summonerLevel+'</h2>';
                
                
                
                
            });
            
            console.log(value.name+" | "+value.summonerLevel);
            
        },
        error: function(data){
            console.log("Error");
        }
        
        
        
        
        
    });
    
    
}