# Version 14.23 — balises par passage

Le site Connecte_test et le projet Supabase CO Anceau ont été mis à jour depuis cette conversation. Actualiser les tablettes hors séance et vérifier 14.23.

Dans Configuration → Paramètres de l’épreuve, régler « Nombre de balises maximum à valider par passage » avant le lancement. Valeurs : 1 à 200 ou Libre. Le choix est figé pendant la séance. 1 est la valeur initiale et conserve le parcours historique. Les lots multiples/Libre utilisent le nouveau protocole.

Avec un maximum de 3 et un ordre imposé, l’élève reçoit au plus 3 balises dans le lot. Il peut revenir après une seule ou deux, puis saisir les balises de ce lot une par une avec « Saisir une autre balise », sans dépasser 3 balises différentes pour ce passage. Une erreur compte parmi les balises traitées ; les notes continuent de compter les tentatives selon le barème existant.

Une balise réussie ne peut plus être proposée ni validée par cet élève. Aucune balise ne peut être ressaisie pendant le même passage. Après une erreur, « Retenter dans le prochain lot » donne un nouveau départ et réserve une place à cette balise dans le lot suivant. Sinon elle revient après les autres lots proposés. Si le lot est incomplet au retour, ses balises non réussies repartent en fin de file, hors retentative prioritaire choisie. En ordre libre, l’élève choisit les balises restantes dans la limite du passage. Libre ne limite pas le nombre de balises du passage.

Les réglages, participants, profils d’entraînement/évaluation et export JSON conservent le paramètre. Les pauses, durées, résultats et les calculs de note existants restent actifs. Les validations de l’enseignant retirent aussi les réussites des propositions aux bornes.

Fichiers applicatifs : index.html, connected.js, passages-core.js, passages.js et sw.js, plus vendor/icons/manifest existants. SQL : installer 01_installation_supabase.sql pour un projet neuf, puis 02_passages.sql et 03_guard_legacy.sql. Pour le projet existant, les migrations ont déjà été appliquées ; ne pas recommencer une installation complète. L’ancien co_sync est maintenu pour le réglage 1 et refuse les anciens clients pour les lots multiples. La nouvelle RPC co_visit reprend les mêmes jetons et contrôles de séance ; aucune table ni donnée utilisateur n’est supprimée.

Vérifications : tests du moteur, de l’interface simulée et cinq suites existantes ; tests transactionnels PostgreSQL avec données fictives annulées ; vérification du paramètre et du lot de départ dans le navigateur, validation au centre et exclusion d’une réussite. La séance fictive du navigateur a été clôturée et sa sauvegarde précédente réimportée. Un essai réel iPad/iPhone élève reste à effectuer.

Retour arrière : références précédentes conservées localement et dans GitHub. Pour rétablir le protocole serveur historique, rollback_guard_legacy.sql conserve sa définition antérieure ; appliquer de manière contrôlée avec la version applicative antérieure. Les nouvelles fonctions sont additives et peuvent rester présentes sans être utilisées. Ne pas effacer les données ou réinitialiser la base pour revenir à une version précédente.
