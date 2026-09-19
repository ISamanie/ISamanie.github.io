
I used webversions of chatgpt, gemini, and claude to generate this project. I used claude to generate the initial draft of the project and gemini/chatgpt to help debug issues.

Create an interactive canvas app for training perspective drawing. The user should be
 given a single face of a cube and then asked to draw the contour lines of the remaining
 visible faces. Use 2 point perspective.
    Debugging. 
        When users click evaluate show the completed cube in green lines.
        instead of point to point lines, make it so that ink is only placed when the user holds click
        Sometimes lines of non-visible faces are included in the solution.

Vary the perspective of the starting face, ie move them closer to the vp to practice foreshortening, and also move the starting face above and below the horizon line to practice different angles.
    Debugging
        Sometimes the starting faces were generated outside of the two vanishing points resulting in impossible geometries.

 Implement a scoring algorithm that calculates distances from endpoints (of the cube), to the user lines to score the users submission.

 Create an ai scoring feature that is implemented in python and communicates with the html app to make calls to the OPENAI api to provide more in depth feedback on the user's technique. The html file should send the python script a snapshot of the users canvas and get a score and feedback in return.


These werent all the prompts I used but are some of the most important ones in the trajectory of the project.