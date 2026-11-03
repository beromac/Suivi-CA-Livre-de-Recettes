# 📒 Livre de recettes

Application web (PC et Android) qui reprend la structure de votre fichier Excel « livre de compte » :

- **Missions** : pour chaque client, les **devis signés** et les **factures** (PDF ou photo prise avec le téléphone).
- **Encaissement** : vous notez la **date d'encaissement** de chaque facture. Le chiffre d'affaires est compté **dans le mois de cette date**, pas dans celui de la facture.
- **Livre chronologique des recettes** et **des dépenses**, mois par mois, comme dans l'Excel (dépenses avec justificatif, frais kilométriques, virements perso, paiements URSSAF).
- **URSSAF** : pour chaque mois (ou trimestre), le chiffre d'affaires à déclarer et les cotisations estimées, avec l'échéance habituelle.
- **Récapitulatif annuel** (recettes, dépenses, URSSAF, trésorerie, marge avant le seuil de TVA).
- **Travail prévu et argent encaissé** : un tableau par mois compare les devis prévus, le facturé et l'encaissé, avec l'écart cumulé (travaillé mais pas encore en trésorerie). Un devis compte dans son mois de réalisation prévu (champ facultatif du devis) ou, à défaut, dans son mois de signature.
- **Impression / PDF** du récapitulatif, des livres et de tous les justificatifs, par mois ou par année.
- **Années** : changez d'année avec les flèches en haut ; chaque année a ses propres totaux.
- Fonctionne **hors-ligne** une fois ouverte, s'installe comme une application sur Android et sur PC.

Les données restent **sur votre appareil** (base du navigateur). Pour les retrouver sur PC *et* Android, activez la synchronisation (étape 3) ou faites des sauvegardes `.zip`.

---

## 1. Mettre l'application en ligne (GitHub Pages) — une seule fois

1. Sur github.com, créez un dépôt (par ex. `livre-recettes`). Il peut être public : il ne contient **que le code**, jamais vos données.
2. Envoyez-y tout le contenu de ce dossier (bouton *Add file → Upload files*, puis *Commit changes*). `index.html` doit être à la racine du dépôt.
3. *Settings → Pages* : *Source* = **Deploy from a branch**, branche **main**, dossier **/ (root)** → *Save*.
4. Après 1 à 2 minutes, l'adresse apparaît en haut de la page : `https://VOTRE-COMPTE.github.io/livre-recettes/`.

## 2. Installer sur Android et sur PC

- **Android (Chrome)** : ouvrez l'adresse, menu ⋮ → *Ajouter à l'écran d'accueil* (ou *Installer l'application*).
- **PC (Chrome / Edge)** : ouvrez l'adresse, cliquez sur l'icône d'installation à droite de la barre d'adresse.

## 3. Retrouver les mêmes données sur PC et Android (synchronisation)

À faire une fois, puis sur chaque appareil :

1. Créez un **deuxième dépôt, PRIVÉ**, uniquement pour vos données (par ex. `mes-donnees-compta`), avec *Add a README file* coché.
   ⚠ Ne mettez jamais vos données dans un dépôt public.
2. GitHub → *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token* :
   - *Repository access* : **Only select repositories** → votre dépôt de données ;
   - *Permissions → Repository permissions → Contents* : **Read and write** ;
   - copiez le jeton (`github_pat_…`).
3. Dans l'application : **⚙ Réglages → Synchronisation** : compte GitHub, nom du dépôt de données, branche (`main`), jeton → *Enregistrer et synchroniser*.
4. Répétez l'étape 3 sur l'autre appareil. Ensuite, chaque modification est envoyée automatiquement (quelques secondes après) et récupérée à l'ouverture de l'application.

Fonctionnement : chaque mission / dépense est fusionnée individuellement (la modification la plus récente gagne) ; les suppressions et les justificatifs sont aussi synchronisés. Le jeton reste enregistré **uniquement sur l'appareil** où vous l'avez saisi : si un appareil est perdu, révoquez le jeton sur GitHub.

## 4. Utilisation au quotidien

1. **Missions → Nouvelle mission** : client, adresse, SIRET, nature de la prestation.
2. Dans la fiche mission : **Ajouter un devis** (date de signature, montant, fichier du devis signé) puis **Ajouter une facture** (numéro proposé automatiquement, montant HT, fichier de la facture).
3. Quand l'argent arrive : **Encaisser** (ou *Marquer encaissée* depuis le Récap) → date d'encaissement + mode (virement, chèque…). Le CA est alors compté ce mois-là.
4. **Dépenses** : ＋ Nouvelle dépense, avec photo du ticket ou PDF de la facture (« 📷 Prendre une photo » sur Android). Les dépenses sans justificatif sont signalées.
5. **URSSAF** : chaque début de mois, le bloc « À déclarer maintenant » indique le chiffre d'affaires encaissé de la période écoulée.
6. **Imprimer** : choisissez le mois ou l'année et les documents → aperçu → *Imprimer / Enregistrer en PDF*.

## Points à connaître

- **Date d'encaissement vide = non comptée.** Une facture sans date d'encaissement n'apparaît dans aucun mois ; elle est listée dans « Factures en attente d'encaissement » sur le Récap.
- **Changement d'année** : une facture encaissée en janvier 2027 est comptée en 2027, même si elle date de 2026.
- **Base de calcul** : le chiffre d'affaires à déclarer est le montant **HT** encaissé (identique au TTC en franchise de TVA, qui est le réglage par défaut). Votre Excel appliquait le taux au TTC ; cela ne change rien tant qu'aucune TVA n'est facturée.
- **Taux de cotisations** : 21,3 % par défaut (repris de votre Excel), modifiable par année dans les Réglages. Les montants sont des **estimations** : la déclaration officielle se fait sur autoentrepreneur.urssaf.fr.
- **Seuil de TVA** : 37 200 € et 300 €/jour par défaut (124 jours × 300 € de votre Excel), modifiables ou masquables.
- **Sauvegardes** : même avec la synchronisation, téléchargez régulièrement une sauvegarde `.zip` (Réglages). Une alerte s'affiche après 30 jours sans sauvegarde.
- **Conservation** : conservez vos justificatifs et livres selon les durées légales ; ce logiciel aide à les tenir mais ne remplace pas un conseil comptable.

## Développement

```bash
npm test                # tests des calculs et de la synchronisation (Node ≥ 18)
python3 -m http.server  # puis http://localhost:8000
```

Aucune étape de compilation. Bibliothèques incluses dans `vendor/` : JSZip (sauvegarde `.zip`) et PDF.js (impression des PDF).
Si vous modifiez des fichiers, changez le numéro de version `CACHE` dans `sw.js` pour forcer la mise à jour du mode hors-ligne.
