#!/usr/bin/python
import psycopg2
import numpy as np
import time


def CreateTables(cur):
    for command in create_tables:
        cur.execute(command)

def DropTables(cur):
    for command in drop_tables:
        cur.execute(command)

def getNumber(cur):
    get_number = [
    """
    select l.label_type_id, count(*)
    from sidewalk.label l, sidewalk.problem_severity ps, sidewalk.label_point p
    where l.label_id = ps.label_id and ps.label_id = p.label_id
    group by l.label_type_id;
    """
    ]

    for command in get_number:
        cur.execute(command)
        rows = cur.fetchall()
        num = np.zeros(7)
        for row in rows:
            num[int(row[0])-1]=int(row[1])
    return num


def getAllPoints(cur):
    get_all_points = []
    for i in range(7):
        get_all_points.append(
        """
        select distinct ps.label_id, ps.severity
        from sidewalk.label l, sidewalk.problem_severity ps, sidewalk.label_point p
        where l.label_id = ps.label_id and ps.label_id = p.label_id and l.label_type_id = {}
        order by ps.severity DESC
        """.format(i+1)
        )

    allPoint = []
    for command in get_all_points:
        cur.execute(command)
        rows = cur.fetchall()
        allPoint.append(np.zeros(len(rows)))
        index = 0
        for row in rows:
            allPoint[-1][index] = np.array(row[0])
            index = index+1
    return allPoint

def calculateZoomLevel(LABEL_TYPE,ZOOM_LEVEL,allPoints,VisNum):
    zoomLevel = []
    for i in range(LABEL_TYPE):
        for j in range(allPoints[i].shape[0]):
            for z in range(ZOOM_LEVEL):
                if j<=VisNum[z,i]:
                    zoomLevel.append([int(allPoints[i][j]),z])
    return zoomLevel

def addZoomLevel(cur,zoomLevel):
    for point in zoomLevel:
        cur.execute("INSERT INTO sidewalk.label_presampled VALUES (%d, %d);"%(point[0],point[1]))

def seperateTables(cur,ZOOM_LEVEL):
    for z in range(ZOOM_LEVEL):
        cur.execute(
        """
        INSERT INTO sidewalk.label_presampled_z%d(
        SELECT ps.label_id
        FROM sidewalk.label_presampled ps
        WHERE ps.zoom_level = %d
        );
        """%(z,z)
        )

def clean_tables(cur):
    cur.execute(
    """
    truncate table label_presampled;
    """
    )

def query(cur):
    queries = [
    """
    SELECT l.label_id
    FROM sidewalk.label l, sidewalk.label_presampled lp
    WHERE l.label_id = lp.label_id and lp.zoom_level = 6
    and l.panorama_lat>38.87 and l.panorama_lat<38.95
    and l.panorama_lng>-77.5 and l.panorama_lng<-77;
    """
    ]

def buildRtree(cur):
    cur.execute(
    """
    DROP INDEX IF EXISTS rt;
    CREATE INDEX rt ON sidewalk.label(panorama_lat,panorama_lng);
    """
    )

def dropRtree(cur):
    cur.execute(
    """
    DROP INDEX rt ON sidewalk.label;
    """
    )


def test(cur):
    begin_time = time.time()
    for i in range(100):
        query(cur)
    end_time = time.time()
    print("Query time without index= ", end_time - begin_time)

    buildRtree(cur)
    begin_time = time.time()
    for i in range(100):
        query(cur)
    end_time = time.time()
    print("Query time with index = ", end_time - begin_time)


def main():
	#make connection
    ZOOM_LEVEL = 7
    LABEL_TYPE = 7
    SampDeg = 0.6
    try:
        conn = psycopg2.connect("dbname='sidewalk' user='sidewalk' host='localhost' port='5433' password='sidewalk'")
    except psycopg2.Error:
        print("I am unable to connect to the database")
    cur = conn.cursor()
    clean_tables(cur)
    getNumber(cur)

    VisNum = np.zeros((ZOOM_LEVEL,LABEL_TYPE))
    VisNum[ZOOM_LEVEL-1] = getNumber(cur)
    for i in range(ZOOM_LEVEL-1):
        VisNum[ZOOM_LEVEL-2-i] = VisNum[ZOOM_LEVEL-1-i]*SampDeg

    VisNum.astype(int)
    allPoints = getAllPoints(cur)
    zoomLevel = calculateZoomLevel(LABEL_TYPE,ZOOM_LEVEL,allPoints,VisNum)
    addZoomLevel(cur,zoomLevel)
    #seperateTables(cur,ZOOM_LEVEL)
    #test(cur)
    conn.commit()


if __name__ == "__main__":
	main()
